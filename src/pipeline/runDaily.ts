import { fetchNewMessages } from "../skills/gmail/fetchNewMessages.js";
import { extractDecision } from "../skills/llm/extractDecision.js";
import { buildEventKey } from "../skills/calendar/eventKey.js";
import { createOrUpdateCalendarEvent } from "../skills/calendar/calendarClient.js";
import { sendDigest } from "../skills/notify/mailer.js";
import { updateCursor } from "../state/store.js";
import type { ProcessedEmail, NormalizedEmail } from "../types.js";
import pino from "pino";

const log = pino({ name: "runDaily" });

/**
 * Load sample emails from local JSON fixtures for dry-run mode.
 */
async function loadSampleEmails(): Promise<NormalizedEmail[]> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const fixturePath = path.default.resolve(process.cwd(), "test", "fixtures", "sample-emails.json");

  if (!fs.default.existsSync(fixturePath)) {
    log.warn("No sample emails found at test/fixtures/sample-emails.json");
    return [];
  }

  const raw = fs.default.readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw) as NormalizedEmail[];
}

/**
 * Process a single email through the LLM + calendar pipeline.
 */
async function processEmail(email: NormalizedEmail): Promise<ProcessedEmail> {
  // Step 1: Get LLM decision
  const decision = await extractDecision(email);

  log.info(
    {
      messageId: email.messageId,
      subject: email.subject,
      classification: decision.classification,
      confidence: decision.confidence,
    },
    "Email classified"
  );

  // Step 2: Build event key if applicable
  let eventKey: string | null = null;
  let calendarEventId: string | null = null;

  if (
    decision.classification === "CREATE_EVENT" ||
    decision.classification === "UPDATE_EVENT"
  ) {
    eventKey = buildEventKey(decision);

    if (eventKey && decision.confidence === "high") {
      // Step 3: Create/update Google Calendar event (only for high-confidence decisions)
      const isUpdate = decision.classification === "UPDATE_EVENT";
      calendarEventId = await createOrUpdateCalendarEvent(
        eventKey,
        decision,
        email,
        isUpdate
      );

      log.info(
        { eventKey, calendarEventId },
        calendarEventId ? "Calendar event created/updated" : "Calendar event skipped (dry run or error)"
      );
    } else if (eventKey && decision.confidence === "low") {
      log.info(
        { messageId: email.messageId, eventKey, confidence: decision.confidence },
        "Low confidence — skipping calendar event, will appear in digest for review"
      );
    } else {
      log.warn(
        { messageId: email.messageId },
        "Could not build event key; skipping calendar event"
      );
    }
  }

  return {
    email,
    decision,
    eventKey,
    calendarEventId,
  };
}

/**
 * Main daily pipeline:
 * 1. Fetch new emails from Gmail (or sample data in dry-run)
 * 2. Classify each with Claude
 * 3. Create Google Calendar events (sends invites to parents)
 * 4. Send digest email to parents
 * 5. Update state cursor
 */
export async function runDaily(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === "true";

  log.info({ isDryRun }, "Starting daily pipeline run");

  // Step 1: Fetch emails
  let emails: NormalizedEmail[];
  if (isDryRun) {
    log.info("DRY RUN: Loading sample emails from fixtures");
    emails = await loadSampleEmails();
  } else {
    emails = await fetchNewMessages();
  }

  if (emails.length === 0) {
    log.info("No new emails to process");
    if (!isDryRun) {
      // Still send digest so parents know the agent ran
      await sendDigest([]);
    }
    return;
  }

  log.info({ count: emails.length }, "Processing emails");

  // Step 2-3: Process each email (continue on individual failures)
  const results: ProcessedEmail[] = [];
  const errors: Array<{ email: NormalizedEmail; error: Error }> = [];

  for (const email of emails) {
    try {
      const result = await processEmail(email);
      results.push(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(
        { messageId: email.messageId, subject: email.subject, err: error.message },
        "Failed to process email; continuing with remaining"
      );
      errors.push({ email, error });
    }
  }

  // Step 4: Send digest
  if (isDryRun) {
    log.info("DRY RUN: Skipping digest email send");
    log.info({ results: results.map((r) => ({
      subject: r.email.subject,
      classification: r.decision.classification,
      confidence: r.decision.confidence,
      eventKey: r.eventKey,
      calendarEventId: r.calendarEventId,
      details: r.decision.details_summary,
    }))}, "Dry run results");
  } else {
    await sendDigest(results);
  }

  // Step 5: Update cursor to highest internalDate processed
  if (!isDryRun && emails.length > 0) {
    const maxDate = Math.max(...emails.map((e) => e.internalDate));
    updateCursor(maxDate);
    log.info({ newCursor: maxDate }, "State cursor updated");
  }

  // Summary
  const created = results.filter((r) => r.decision.classification === "CREATE_EVENT").length;
  const updated = results.filter((r) => r.decision.classification === "UPDATE_EVENT").length;
  const clarify = results.filter((r) => r.decision.classification === "NEEDS_CLARIFICATION").length;
  const ignored = results.filter((r) => r.decision.classification === "IGNORE").length;

  log.info(
    { created, updated, needsClarification: clarify, ignored, errors: errors.length },
    "Daily pipeline complete"
  );

  if (errors.length > 0) {
    log.warn(
      { failedSubjects: errors.map((e) => e.email.subject) },
      "Some emails failed processing"
    );
  }
}
