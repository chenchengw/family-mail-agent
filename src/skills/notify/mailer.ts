import nodemailer from "nodemailer";
import type { ProcessedEmail } from "../../types.js";
import { getConfig } from "../../config.js";
import { buildDigestHtml, buildDigestText } from "./digestTemplate.js";
import pino from "pino";

const log = pino({ name: "mailer" });

function createTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    },
  });
}

/**
 * Send the daily digest email to all configured parent emails.
 * Calendar invites are sent separately by Google Calendar API.
 */
export async function sendDigest(results: ProcessedEmail[]): Promise<void> {
  const config = getConfig();
  const transport = createTransport();
  const today = new Date().toISOString().slice(0, 10);

  const html = buildDigestHtml(results);
  const text = buildDigestText(results);

  const recipients = config.parents.notify_to.join(", ");

  const created = results.filter((r) => r.decision.classification === "CREATE_EVENT").length;
  const updated = results.filter((r) => r.decision.classification === "UPDATE_EVENT").length;
  const clarify = results.filter((r) => r.decision.classification === "NEEDS_CLARIFICATION").length;

  const subject = `Family Schedule Digest ${today} — ${created} new, ${updated} updated, ${clarify} need attention`;

  log.info(
    { recipients, subject },
    "Sending digest email"
  );

  await transport.sendMail({
    from: `"Family Mail Agent" <${process.env.GMAIL_USER}>`,
    to: recipients,
    subject,
    html,
    text,
  });

  log.info("Digest email sent successfully");
}
