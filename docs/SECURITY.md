# Security Model

## Core Principles

1. **Trust email text only** — The agent reads the plain text content of emails. It does not:
   - Open links or URLs
   - Download or parse attachments (PDFs, images, etc.)
   - Log into any portal or website
   - Submit forms
   - Make payments

2. **Least privilege** — The Gmail API token only has `gmail.readonly` scope. The agent cannot send, delete, or modify emails in the monitored mailbox.

3. **When uncertain, ask** — If the agent cannot extract complete event details, it classifies the email as `NEEDS_CLARIFICATION` and suggests a reply the parent can send. It never guesses dates, times, or locations.

## Secrets Handling

### Environment variables

All secrets are stored in `.env` (gitignored). Required secrets:

| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `GMAIL_CLIENT_ID` | OAuth client identification | Medium |
| `GMAIL_CLIENT_SECRET` | OAuth client authentication | High |
| `GMAIL_REFRESH_TOKEN` | Long-lived Gmail API access | High |
| `CLAUDE_API_KEY` | Claude API authentication | High |
| `SMTP_APP_PASSWORD` | Gmail SMTP sending | High |

### Recommendations

- Never commit `.env` to version control
- Use a secrets manager in production (e.g., AWS Secrets Manager, 1Password CLI)
- Rotate the Gmail refresh token periodically
- Use a dedicated Gmail account for the agent, not a personal account
- Restrict the OAuth client to only the `gmail.readonly` scope

## Gmail API Permissions

The agent requires only one OAuth scope:

```
https://www.googleapis.com/auth/gmail.readonly
```

This allows:
- Listing messages
- Reading message content and headers

It does **not** allow:
- Sending emails (sending is done via SMTP with a separate app password)
- Deleting or modifying messages
- Managing labels or filters
- Accessing contacts or calendar

## Sender Allowlist

Only emails from explicitly allowlisted senders or domains are processed. This prevents:
- Spam from being sent to the LLM
- Phishing emails from generating fake calendar events
- Random senders from injecting events into the family calendar

Configure allowlists in `config/agent.yml`. See [CONFIG.md](CONFIG.md).

## LLM Safety

- The LLM (Claude) only receives the cleaned email text — no links, no attachments
- Quoted replies and signatures are stripped before sending to the LLM
- The LLM output is validated against a strict Zod schema
- Invalid LLM responses are caught and classified as `NEEDS_CLARIFICATION`
- The LLM cannot take actions — it only outputs a JSON classification

## State File

`data/state.json` contains:
- The cursor timestamp (last processed email date)
- Event key to UID/sequence mappings

This file is gitignored but should be backed up if you want to preserve event update tracking across reinstalls.

## Network Access

The agent makes outbound connections to:
- `gmail.googleapis.com` — Gmail API (read-only)
- `api.anthropic.com` — Claude API
- `smtp.gmail.com` — SMTP for sending digest emails

No inbound connections are required. The agent does not run a web server.

## Digest Email

The digest email is sent to the configured parent addresses only. It contains:
- Summaries of classified emails
- ICS calendar file attachments
- No raw email content or headers from original senders
