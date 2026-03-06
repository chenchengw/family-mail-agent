import { getClaudeClient, getModelId } from "./claudeClient.js";
import { systemPrompt, developerPrompt, userPrompt } from "./prompts.js";
import { LlmDecisionSchema, type LlmDecision, type NormalizedEmail, type SenderProfile } from "../../types.js";
import { getConfig } from "../../config.js";
import pino from "pino";

const log = pino({ name: "extractDecision" });

/**
 * Look up a sender profile from config, checking exact email match first,
 * then @domain match.
 */
function findSenderProfile(email: NormalizedEmail): SenderProfile | undefined {
  const config = getConfig();
  const profiles = config.sender_profiles;

  // Try exact email match (extract email from "Name <email>" format)
  const emailMatch = email.from.match(/<([^>]+)>/);
  const senderAddr = emailMatch ? emailMatch[1].toLowerCase() : email.from.toLowerCase();

  if (profiles[senderAddr]) return profiles[senderAddr];

  // Try @domain match
  const domainKey = `@${email.fromDomain}`;
  if (profiles[domainKey]) return profiles[domainKey];

  return undefined;
}

/**
 * Call Claude to classify an email and extract event details.
 * Returns a validated LlmDecision.
 */
export async function extractDecision(
  email: NormalizedEmail
): Promise<LlmDecision> {
  const client = getClaudeClient();
  const model = getModelId();
  const today = new Date().toISOString().slice(0, 10);
  const senderProfile = findSenderProfile(email);

  log.info(
    { messageId: email.messageId, subject: email.subject, model },
    "Calling Claude for classification"
  );

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt(today) + "\n\n" + developerPrompt(),
    messages: [
      {
        role: "user",
        content: userPrompt(email.from, email.subject, email.body, senderProfile),
      },
    ],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock?.type === "text" ? textBlock.text : "";

  log.debug({ rawText }, "Raw LLM response");

  // Try to parse JSON
  let parsed: unknown;
  try {
    // Strip markdown fences if the model wraps them despite instructions
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.warn({ rawText, err }, "Failed to parse LLM response as JSON");
    return {
      classification: "NEEDS_CLARIFICATION",
      child: null,
      activity: null,
      event_date: null,
      event_end_date: null,
      recurrence: null,
      start_time: null,
      end_time: null,
      location: null,
      due_date: null,
      details_summary: `LLM returned unparseable response: ${rawText.slice(0, 200)}`,
      missing_fields: ["all"],
      suggested_reply: null,
      confidence: "low",
    };
  }

  // Validate with zod
  const result = LlmDecisionSchema.safeParse(parsed);
  if (!result.success) {
    log.warn(
      { errors: result.error.issues, parsed },
      "LLM response failed schema validation"
    );
    return {
      classification: "NEEDS_CLARIFICATION",
      child: null,
      activity: null,
      event_date: null,
      event_end_date: null,
      recurrence: null,
      start_time: null,
      end_time: null,
      location: null,
      due_date: null,
      details_summary: `LLM response failed validation: ${result.error.issues.map((i) => i.message).join("; ")}`,
      missing_fields: ["all"],
      suggested_reply: null,
      confidence: "low",
    };
  }

  return result.data;
}
