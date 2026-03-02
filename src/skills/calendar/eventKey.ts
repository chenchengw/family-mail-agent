import type { LlmDecision } from "../../types.js";

/**
 * Build a deterministic event key from extracted fields.
 * Format: child|activity|event_date|start_time|location
 * Null parts are omitted but separators are kept for positional clarity.
 */
export function buildEventKey(decision: LlmDecision): string | null {
  // Need at minimum an activity or child plus a date to form a useful key
  if (!decision.activity && !decision.child) return null;
  if (!decision.event_date && !decision.due_date) return null;

  const parts = [
    (decision.child ?? "").toLowerCase().trim(),
    (decision.activity ?? "").toLowerCase().trim(),
    decision.event_date ?? decision.due_date ?? "",
    decision.start_time ?? "",
    (decision.location ?? "").toLowerCase().trim(),
  ];

  return parts.join("|");
}
