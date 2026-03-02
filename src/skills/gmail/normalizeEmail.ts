import type { gmail_v1 } from "googleapis";
import type { NormalizedEmail } from "../../types.js";

/**
 * Extract a header value from a Gmail message.
 */
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * Recursively extract text/plain body from message parts.
 */
function extractTextBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractTextBody(part);
      if (text) return text;
    }
  }

  // Fallback: if only HTML is available, decode it and strip tags
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    return stripHtml(html);
  }

  return "";
}

/**
 * Strip HTML tags to produce plain text (simple approach).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/**
 * Remove quoted replies and signature blocks from email text.
 */
function removeQuotedReplies(text: string): string {
  const lines = text.split("\n");
  const cleaned: string[] = [];

  for (const line of lines) {
    // Stop at reply markers (but keep forwarded content — that's the actual email)
    if (/^-{2,}\s*Original Message/i.test(line)) break;
    if (/^On .+ wrote:$/i.test(line)) break;
    // Strip the "Forwarded message" marker line itself, but continue processing
    if (/^-{2,}\s*Forwarded message/i.test(line)) continue;
    // Stop at common signature separators
    if (/^-- ?$/.test(line)) break;
    // Skip lines starting with '>' (quoted)
    if (/^>/.test(line)) continue;

    cleaned.push(line);
  }

  return cleaned.join("\n");
}

/**
 * Collapse excessive whitespace.
 */
function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract the domain from an email address string like "Name <user@domain.com>"
 */
function extractDomain(from: string): string {
  const match = from.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : "";
}

/**
 * Normalize a Gmail API message into our internal format.
 */
export function normalizeEmail(
  message: gmail_v1.Schema$Message
): NormalizedEmail {
  const headers = message.payload?.headers;
  const from = getHeader(headers, "From");
  const subject = getHeader(headers, "Subject");
  const dateHeader = getHeader(headers, "Date");
  const internalDate = parseInt(message.internalDate ?? "0", 10);

  const rawBody = message.payload ? extractTextBody(message.payload) : "";
  const cleanBody = collapseWhitespace(removeQuotedReplies(rawBody));

  return {
    messageId: message.id ?? "",
    from,
    fromDomain: extractDomain(from),
    subject,
    body: cleanBody,
    receivedAt: dateHeader || new Date(internalDate).toISOString(),
    internalDate,
  };
}
