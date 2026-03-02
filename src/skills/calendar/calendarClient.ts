import { google, type calendar_v3 } from "googleapis";
import { getConfig } from "../../config.js";
import {
  getEventMapping,
  upsertEventMapping,
} from "../../state/store.js";
import { isDueDateOnly } from "../../types.js";
import type { LlmDecision, NormalizedEmail } from "../../types.js";
import { randomUUID } from "node:crypto";
import pino from "pino";

const log = pino({ name: "calendarClient" });

let _calendar: calendar_v3.Calendar | null = null;

export function getCalendarClient(): calendar_v3.Calendar {
  if (_calendar) return _calendar;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  _calendar = google.calendar({ version: "v3", auth: oauth2Client });
  return _calendar;
}

/**
 * Build a title like "Soccer Practice - Alice" (skip null parts).
 * Prefix with "DUE: " for deadline-only items.
 */
function buildSummary(decision: LlmDecision, isDueDate: boolean): string {
  const parts = [decision.activity, decision.child].filter(Boolean);
  const base = parts.join(" - ") || "Family Event";
  return isDueDate ? `DUE: ${base}` : base;
}

/**
 * Build the event description from email metadata and LLM summary.
 */
function buildDescription(
  decision: LlmDecision,
  email: NormalizedEmail
): string {
  return [
    `Original email subject: ${email.subject}`,
    `From: ${email.from}`,
    `Received: ${email.receivedAt}`,
    "",
    decision.details_summary,
  ].join("\n");
}

/**
 * Build a Google Calendar event resource from a decision.
 */
function buildEventResource(
  decision: LlmDecision,
  email: NormalizedEmail
): calendar_v3.Schema$Event {
  const config = getConfig();
  const dueOnly = isDueDateOnly(decision);
  const summary = buildSummary(decision, dueOnly);
  const description = buildDescription(decision, email);

  const dateStr =
    decision.event_date ?? decision.due_date ?? new Date().toISOString().slice(0, 10);

  const attendees: calendar_v3.Schema$EventAttendee[] =
    config.parents.notify_to.map((email) => ({ email }));

  if (dueOnly) {
    // All-day event: end date is exclusive, so end = start + 1 day
    const endDate = nextDay(dateStr);
    return {
      summary,
      description,
      location: decision.location ?? undefined,
      start: { date: dateStr },
      end: { date: endDate },
      attendees,
    };
  }

  // Timed event
  const startTime = decision.start_time ?? "09:00";
  const endTime =
    decision.end_time ?? addOneHour(startTime);

  return {
    summary,
    description,
    location: decision.location ?? undefined,
    start: {
      dateTime: `${dateStr}T${startTime}:00`,
      timeZone: config.timezone,
    },
    end: {
      dateTime: `${dateStr}T${endTime}:00`,
      timeZone: config.timezone,
    },
    attendees,
  };
}

/** Add one day to a YYYY-MM-DD string. */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Add one hour to an HH:MM string. */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = String(Math.min(h + 1, 23)).padStart(2, "0");
  return `${newH}:${String(m).padStart(2, "0")}`;
}

/**
 * Create or update a Google Calendar event.
 * Returns the calendar event ID on success, or null on failure.
 * Never throws — errors are logged and null is returned.
 */
export async function createOrUpdateCalendarEvent(
  eventKey: string,
  decision: LlmDecision,
  email: NormalizedEmail,
  isUpdate: boolean
): Promise<string | null> {
  const isDryRun = process.env.DRY_RUN === "true";

  // Resolve UID + sequence for state tracking (same pattern as before)
  const existing = getEventMapping(eventKey);
  let uid: string;
  let sequence: number;

  if (isUpdate && existing) {
    uid = existing.uid;
    sequence = existing.sequence + 1;
  } else {
    if (isUpdate && !existing) {
      log.warn(
        { eventKey },
        "UPDATE_EVENT requested but no existing mapping found; creating new event"
      );
    }
    uid = randomUUID();
    sequence = 0;
  }

  const resource = buildEventResource(decision, email);

  if (isDryRun) {
    log.info({ eventKey, summary: resource.summary }, "DRY RUN: Would create/update calendar event");
    upsertEventMapping(eventKey, { uid, sequence });
    return null;
  }

  try {
    const calendar = getCalendarClient();
    let calendarEventId: string;

    if (isUpdate && existing?.calendarEventId) {
      // Patch existing event
      const res = await calendar.events.patch({
        calendarId: "primary",
        eventId: existing.calendarEventId,
        sendUpdates: "all",
        requestBody: resource,
      });
      calendarEventId = res.data.id!;
      log.info(
        { eventKey, calendarEventId, sequence },
        "Calendar event updated"
      );
    } else {
      // Insert new event
      const res = await calendar.events.insert({
        calendarId: "primary",
        sendUpdates: "all",
        requestBody: resource,
      });
      calendarEventId = res.data.id!;
      log.info(
        { eventKey, calendarEventId, sequence },
        "Calendar event created"
      );
    }

    upsertEventMapping(eventKey, { uid, sequence, calendarEventId });
    return calendarEventId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { eventKey, err: message },
      "Failed to create/update calendar event"
    );
    // Still persist the uid/sequence so we don't lose track
    upsertEventMapping(eventKey, { uid, sequence });
    return null;
  }
}
