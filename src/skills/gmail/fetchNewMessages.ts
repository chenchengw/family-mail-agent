import { getGmailClient } from "./gmailClient.js";
import { normalizeEmail } from "./normalizeEmail.js";
import { getCursor } from "../../state/store.js";
import { getConfig } from "../../config.js";
import type { NormalizedEmail } from "../../types.js";
import pino from "pino";

const log = pino({ name: "fetchNewMessages" });

/**
 * Skip emails that are obviously not actionable — calendar RSVPs,
 * delivery failures, the agent's own outbound emails, etc.
 * Checked before the LLM call to save tokens.
 */
function isAutoSkip(email: NormalizedEmail): boolean {
  const subjectLower = email.subject.toLowerCase();
  const fromLower = email.from.toLowerCase();
  const agentEmail = (process.env.GMAIL_USER ?? "").toLowerCase();

  // Calendar RSVP responses from Google
  if (fromLower.includes("calendar-notification@google.com")) return true;
  if (/^(accepted|declined|tentative):/.test(subjectLower)) return true;

  // Agent's own outbound emails (digests echoed back)
  if (agentEmail && fromLower.includes(agentEmail)) return true;

  // Delivery failures
  if (fromLower.includes("mailer-daemon@")) return true;
  if (subjectLower.includes("delivery status notification")) return true;

  // Gmail system emails
  if (fromLower.includes("forwarding-noreply@google.com")) return true;

  return false;
}

/**
 * Check whether a sender is allowed by config.
 */
function isSenderAllowed(email: NormalizedEmail): boolean {
  const config = getConfig();

  // If no allowlists configured, accept all emails
  if (config.email.allowed_senders.length === 0 && config.email.allowed_domains.length === 0) {
    return true;
  }

  const fromLower = email.from.toLowerCase();
  const domainLower = email.fromDomain.toLowerCase();

  // Check exact sender match
  for (const allowed of config.email.allowed_senders) {
    if (fromLower.includes(allowed.toLowerCase())) return true;
  }

  // Check domain match
  for (const domain of config.email.allowed_domains) {
    if (domainLower === domain.toLowerCase()) return true;
  }

  return false;
}

/**
 * Fetch new messages from Gmail that are newer than our stored cursor.
 * Returns only messages from allowed senders/domains.
 */
export async function fetchNewMessages(): Promise<NormalizedEmail[]> {
  const gmail = getGmailClient();
  const cursor = getCursor();
  const userId = process.env.GMAIL_USER ?? "me";

  // Build query: messages newer than our cursor timestamp
  // Gmail query `after:` uses epoch seconds
  const afterEpochSec = cursor > 0 ? Math.floor(cursor / 1000) : 0;
  const query = afterEpochSec > 0 ? `after:${afterEpochSec}` : undefined;

  log.info({ query, cursor }, "Fetching messages from Gmail");

  const listRes = await gmail.users.messages.list({
    userId,
    q: query,
    maxResults: 100,
  });

  const messageRefs = listRes.data.messages ?? [];
  if (messageRefs.length === 0) {
    log.info("No new messages found");
    return [];
  }

  log.info({ count: messageRefs.length }, "Found message references");

  const emails: NormalizedEmail[] = [];

  for (const ref of messageRefs) {
    if (!ref.id) continue;

    const msgRes = await gmail.users.messages.get({
      userId,
      id: ref.id,
      format: "full",
    });

    const normalized = normalizeEmail(msgRes.data);

    // Skip messages at or before our cursor (after: is inclusive)
    if (normalized.internalDate <= cursor) {
      continue;
    }

    if (!isSenderAllowed(normalized)) {
      log.debug(
        { from: normalized.from, subject: normalized.subject },
        "Skipping message from non-allowed sender"
      );
      continue;
    }

    if (isAutoSkip(normalized)) {
      log.debug(
        { from: normalized.from, subject: normalized.subject },
        "Auto-skipping non-actionable email (RSVP, bounce, system)"
      );
      continue;
    }

    emails.push(normalized);
  }

  // Sort by internalDate ascending
  emails.sort((a, b) => a.internalDate - b.internalDate);

  log.info({ count: emails.length }, "Filtered allowed messages");
  return emails;
}
