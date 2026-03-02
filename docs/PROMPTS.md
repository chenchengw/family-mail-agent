# LLM Prompts and Schema

This document describes the prompts sent to Claude and the expected JSON response schema.

## Prompt Structure

Each email is sent to Claude with three message components:

### 1. System Prompt

Sets the role and rules:

```
You are a family scheduling assistant. Today's date is {YYYY-MM-DD}.

Your job is to read an email and decide if it describes a calendar event that a parent should know about. You output ONLY valid JSON — no prose, no markdown fences, no explanation.

RULES:
1. Trust the email text only. Do not open links. Do not guess information not present.
2. If the email clearly describes a NEW event with date, time, and activity, classify as CREATE_EVENT.
3. If the email describes a CHANGE to a previously communicated event, classify as UPDATE_EVENT.
4. If the email mentions an event or due date but is MISSING a required field (date, time, due_date), classify as NEEDS_CLARIFICATION and list the missing fields.
5. If the email is not about scheduling (newsletters, receipts, ads, social), classify as IGNORE.
6. When uncertain, choose NEEDS_CLARIFICATION rather than guessing.
7. For UPDATE_EVENT: the child, activity, and original event_date should match the prior event where possible.
8. due_date is for homework/assignments without a specific event time — just a deadline.
9. Normalize times to 24-hour HH:MM format.
10. event_date and due_date must be YYYY-MM-DD.
```

### 2. Developer Prompt (JSON schema enforcement)

```
Respond with ONLY a JSON object matching this exact schema:

{
  "classification": "CREATE_EVENT" | "UPDATE_EVENT" | "NEEDS_CLARIFICATION" | "IGNORE",
  "child": string | null,
  "activity": string | null,
  "event_date": "YYYY-MM-DD" | null,
  "start_time": "HH:MM" | null,
  "end_time": "HH:MM" | null,
  "location": string | null,
  "due_date": "YYYY-MM-DD" | null,
  "details_summary": string,
  "missing_fields": string[],
  "suggested_reply": string | null
}
```

### 3. User Prompt (the email)

```
From: {sender}
Subject: {subject}
Sender context: child: Alice, activity: Soccer    (if sender profile exists)

Body:
{cleaned email body}
```

## JSON Response Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `classification` | enum | Yes | One of: `CREATE_EVENT`, `UPDATE_EVENT`, `NEEDS_CLARIFICATION`, `IGNORE` |
| `child` | string \| null | Yes | Name of the child the event concerns |
| `activity` | string \| null | Yes | Name of the activity (e.g., "Soccer Practice") |
| `event_date` | string \| null | Yes | Event date in `YYYY-MM-DD` format |
| `start_time` | string \| null | Yes | Start time in `HH:MM` 24-hour format |
| `end_time` | string \| null | Yes | End time in `HH:MM` 24-hour format |
| `location` | string \| null | Yes | Event location |
| `due_date` | string \| null | Yes | Deadline for assignments (no specific time) |
| `details_summary` | string | Yes | 1-2 sentence summary of the event |
| `missing_fields` | string[] | Yes | Fields that are missing but needed (empty if not NEEDS_CLARIFICATION) |
| `suggested_reply` | string \| null | Yes | Suggested reply to sender when clarification needed |

## Zod Validation

The response is validated using this Zod schema (from `src/types.ts`):

```typescript
const LlmDecisionSchema = z.object({
  classification: z.enum([
    "CREATE_EVENT",
    "UPDATE_EVENT",
    "NEEDS_CLARIFICATION",
    "IGNORE",
  ]),
  child: z.string().nullable(),
  activity: z.string().nullable(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  location: z.string().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  details_summary: z.string(),
  missing_fields: z.array(z.string()).default([]),
  suggested_reply: z.string().nullable().default(null),
});
```

## Validation Failure Handling

If the LLM response:
- Cannot be parsed as JSON → returns `NEEDS_CLARIFICATION` with `details_summary` containing the parse error
- Fails Zod validation → returns `NEEDS_CLARIFICATION` with validation errors in `details_summary`

This ensures the pipeline never crashes on unexpected LLM output.

## Example Responses

### CREATE_EVENT

```json
{
  "classification": "CREATE_EVENT",
  "child": "Alice",
  "activity": "Soccer Practice",
  "event_date": "2025-03-15",
  "start_time": "16:00",
  "end_time": "17:30",
  "location": "Lincoln Park Field 3",
  "due_date": null,
  "details_summary": "Regular soccer practice scheduled for Saturday March 15th from 4-5:30pm at Lincoln Park Field 3.",
  "missing_fields": [],
  "suggested_reply": null
}
```

### NEEDS_CLARIFICATION

```json
{
  "classification": "NEEDS_CLARIFICATION",
  "child": "Bob",
  "activity": "Piano Recital",
  "event_date": null,
  "start_time": "14:00",
  "end_time": null,
  "location": "Community Center",
  "due_date": null,
  "details_summary": "Piano recital mentioned at 2pm at the Community Center but no date was specified.",
  "missing_fields": ["event_date"],
  "suggested_reply": "Hi, could you confirm the date of the piano recital? We have the time (2pm) and location (Community Center) but not the specific date."
}
```

### IGNORE

```json
{
  "classification": "IGNORE",
  "child": null,
  "activity": null,
  "event_date": null,
  "start_time": null,
  "end_time": null,
  "location": null,
  "due_date": null,
  "details_summary": "Monthly newsletter from the school with general announcements, no specific events requiring calendar entries.",
  "missing_fields": [],
  "suggested_reply": null
}
```
