import { z } from "zod";

// ── LLM Decision Schema ─────────────────────────────────────────────

export const ClassificationEnum = z.enum([
  "CREATE_EVENT",
  "UPDATE_EVENT",
  "NEEDS_CLARIFICATION",
  "IGNORE",
]);
export type Classification = z.infer<typeof ClassificationEnum>;

export const LlmDecisionSchema = z.object({
  classification: ClassificationEnum,
  child: z.string().nullable(),
  activity: z.string().nullable(),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .nullable(),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
    .nullable(),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
    .nullable(),
  location: z.string().nullable(),
  event_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .nullable()
    .default(null),
  recurrence: z
    .enum(["daily", "weekly"])
    .nullable()
    .default(null),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .nullable(),
  details_summary: z.string(),
  missing_fields: z.array(z.string()).default([]),
  suggested_reply: z.string().nullable().default(null),
  confidence: z.enum(["high", "low"]),
});
export type LlmDecision = z.infer<typeof LlmDecisionSchema>;

/**
 * Returns true when the decision represents a pure deadline (due_date set,
 * but no event_date and no start_time). Used by calendar client and digest.
 */
export function isDueDateOnly(d: LlmDecision): boolean {
  return d.due_date != null && d.event_date == null && d.start_time == null;
}

// ── Normalized Email ─────────────────────────────────────────────────

export interface NormalizedEmail {
  messageId: string;
  from: string;
  fromDomain: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO-8601
  internalDate: number; // epoch ms from Gmail
}

// ── Processed Result ─────────────────────────────────────────────────

export interface ProcessedEmail {
  email: NormalizedEmail;
  decision: LlmDecision;
  eventKey: string | null;
  calendarEventId: string | null;
}

// ── State Persistence ────────────────────────────────────────────────

export interface EventMapping {
  uid: string;
  sequence: number;
  calendarEventId?: string;
}

export interface AppState {
  lastProcessedInternalDate: number; // epoch ms; 0 means first run
  eventKeys: Record<string, EventMapping>;
}

// ── Config Types ─────────────────────────────────────────────────────

export interface SenderProfile {
  child?: string;
  activity?: string;
  keywords?: string[];
}

export interface AgentConfig {
  timezone: string;
  parents: {
    notify_to: string[];
  };
  email: {
    allowed_senders: string[];
    allowed_domains: string[];
  };
  sender_profiles: Record<string, SenderProfile>;
}
