import { isDueDateOnly } from "../../types.js";
import type { ProcessedEmail } from "../../types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "TBD";
  // Format YYYY-MM-DD → "Mar 1, 2026"
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(start: string | null, end: string | null): string {
  if (!start) return "";
  return end ? `${start}–${end}` : start;
}

function categorize(results: ProcessedEmail[]) {
  const calendarAdded: ProcessedEmail[] = [];
  const needsReview: ProcessedEmail[] = [];
  const needsClarification: ProcessedEmail[] = [];
  let skipped = 0;

  for (const r of results) {
    switch (r.decision.classification) {
      case "CREATE_EVENT":
      case "UPDATE_EVENT":
        if (r.decision.confidence === "high") {
          calendarAdded.push(r);
        } else {
          needsReview.push(r);
        }
        break;
      case "NEEDS_CLARIFICATION":
        needsClarification.push(r);
        break;
      case "IGNORE":
        skipped++;
        break;
    }
  }

  return { calendarAdded, needsReview, needsClarification, skipped };
}

// ── HTML Digest ──────────────────────────────────────────────────────

export function buildDigestHtml(results: ProcessedEmail[]): string {
  const { calendarAdded, needsReview, needsClarification, skipped } =
    categorize(results);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const total = results.length;
  const added = calendarAdded.length;

  let html = `<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">`;

  // Header
  html += `<h2 style="margin-bottom:4px;">Family Schedule Digest &mdash; ${today}</h2>`;
  html += `<p style="color:#888;margin-top:0;">${total} processed, ${added} added to calendar, ${skipped} skipped</p>`;
  html += `<hr style="border:1px solid #eee;">`;

  // Calendar Events Added
  if (calendarAdded.length > 0) {
    html += `<h3 style="color:#27ae60;">Calendar Events Added</h3>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:14px;">`;
    for (const r of calendarAdded) {
      const d = r.decision;
      const dueOnly = isDueDateOnly(d);
      const dateDisplay = dueOnly
        ? `Due ${formatDate(d.due_date)}`
        : formatDate(d.event_date);
      const time = dueOnly ? "" : formatTime(d.start_time, d.end_time);

      html += `<tr style="border-bottom:1px solid #f0f0f0;">`;
      html += `<td style="padding:6px 4px;"><strong>${d.activity ?? "Event"}</strong>${d.child ? ` — ${d.child}` : ""}</td>`;
      html += `<td style="padding:6px 4px;color:#555;">${dateDisplay}${time ? ` ${time}` : ""}</td>`;
      html += `<td style="padding:6px 4px;color:#888;">${d.location ?? ""}</td>`;
      html += `</tr>`;
    }
    html += `</table>`;
    html += `<p style="color:#888;font-size:12px;margin-top:4px;">Calendar invites sent to attendees.</p>`;
  }

  // Needs Review
  if (needsReview.length > 0) {
    html += `<h3 style="color:#e67e22;">Needs Review (${needsReview.length})</h3>`;
    html += `<p style="color:#888;font-size:13px;">Low-confidence matches — no calendar event created.</p>`;
    html += `<ul style="padding-left:16px;">`;
    for (const r of needsReview) {
      const d = r.decision;
      html += `<li style="margin-bottom:8px;border-left:3px solid #e67e22;padding-left:8px;">`;
      html += `<strong>${d.activity ?? "Event"}</strong>${d.child ? ` — ${d.child}` : ""}`;
      html += `<br><span style="color:#555;">Date: ${formatDate(d.event_date ?? d.due_date)}`;
      html += d.start_time ? ` | Time: ${formatTime(d.start_time, d.end_time)}` : "";
      html += d.location ? ` | Location: ${d.location}` : "";
      html += `</span>`;
      html += `<br><em>${d.details_summary}</em>`;
      html += `<br><small>From: ${r.email.from} | Subject: ${r.email.subject}</small>`;
      html += `</li>`;
    }
    html += `</ul>`;
  }

  // Needs Clarification
  if (needsClarification.length > 0) {
    html += `<h3 style="color:#e67e22;">Needs Clarification (${needsClarification.length})</h3>`;
    html += `<ul style="padding-left:16px;">`;
    for (const r of needsClarification) {
      const d = r.decision;
      html += `<li style="margin-bottom:8px;">`;
      html += `<strong>${r.email.subject}</strong>`;
      html += `<br><em>${d.details_summary}</em>`;
      html += `<br><span style="color:#c0392b;">Missing: ${d.missing_fields.join(", ")}</span>`;
      if (d.suggested_reply) {
        html += `<br><strong>Suggested reply:</strong> <em>"${d.suggested_reply}"</em>`;
      }
      html += `<br><small>From: ${r.email.from}</small>`;
      html += `</li>`;
    }
    html += `</ul>`;
  }

  if (results.length === 0) {
    html += `<p style="color:#999;">No new emails to process today.</p>`;
  }

  html += `<hr style="border:1px solid #eee;">`;
  html += `<p style="color:#bbb;font-size:11px;">Generated by Family Mail Agent. Do not reply to this email.</p>`;
  html += `</body></html>`;

  return html;
}

// ── Plain-Text Digest ────────────────────────────────────────────────

export function buildDigestText(results: ProcessedEmail[]): string {
  const { calendarAdded, needsReview, needsClarification, skipped } =
    categorize(results);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const total = results.length;
  const added = calendarAdded.length;

  const lines: string[] = [
    `Family Schedule Digest — ${today}`,
    `${total} processed, ${added} added to calendar, ${skipped} skipped`,
    "=".repeat(50),
    "",
  ];

  if (calendarAdded.length > 0) {
    lines.push("CALENDAR EVENTS ADDED:");
    for (const r of calendarAdded) {
      const d = r.decision;
      const dueOnly = isDueDateOnly(d);
      const dateDisplay = dueOnly
        ? `Due ${formatDate(d.due_date)}`
        : formatDate(d.event_date);
      const time = dueOnly ? "" : formatTime(d.start_time, d.end_time);
      const loc = d.location ? ` | ${d.location}` : "";

      lines.push(
        `  - ${d.activity ?? "Event"}${d.child ? ` — ${d.child}` : ""} | ${dateDisplay}${time ? ` ${time}` : ""}${loc}`
      );
    }
    lines.push("  Calendar invites sent to attendees.");
    lines.push("");
  }

  if (needsReview.length > 0) {
    lines.push(`NEEDS REVIEW (${needsReview.length}):`);
    lines.push("  (Low confidence — no calendar event created)");
    for (const r of needsReview) {
      const d = r.decision;
      lines.push(
        `  - ${d.activity ?? "Event"}${d.child ? ` — ${d.child}` : ""}`
      );
      lines.push(
        `    Date: ${formatDate(d.event_date ?? d.due_date)} ${formatTime(d.start_time, d.end_time)}`
      );
      if (d.location) lines.push(`    Location: ${d.location}`);
      lines.push(`    ${d.details_summary}`);
      lines.push(`    From: ${r.email.from} | Subject: ${r.email.subject}`);
    }
    lines.push("");
  }

  if (needsClarification.length > 0) {
    lines.push(`NEEDS CLARIFICATION (${needsClarification.length}):`);
    for (const r of needsClarification) {
      lines.push(`  - ${r.email.subject}: ${r.decision.details_summary}`);
      lines.push(`    Missing: ${r.decision.missing_fields.join(", ")}`);
      if (r.decision.suggested_reply) {
        lines.push(`    Suggested reply: "${r.decision.suggested_reply}"`);
      }
    }
    lines.push("");
  }

  if (results.length === 0) {
    lines.push("No new emails to process today.");
    lines.push("");
  }

  lines.push("---");
  lines.push("Generated by Family Mail Agent.");
  return lines.join("\n");
}
