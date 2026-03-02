# Family Mail Agent

A daily email-to-calendar bot that reads a dedicated Gmail mailbox, uses Claude to classify scheduling emails, generates ICS calendar invites, and sends a digest to parents.

## How It Works

1. **Fetch** — Reads new emails from a Gmail mailbox via the Gmail API
2. **Filter** — Only processes emails from allowlisted senders/domains
3. **Classify** — Sends each email to Claude for structured JSON extraction (event details, classification)
4. **Generate** — Creates ICS calendar files for new/updated events with stable UIDs
5. **Notify** — Sends a digest email to parents with event summaries and ICS attachments
6. **Persist** — Saves cursor position and event-key-to-UID mappings in `data/state.json`

## Prerequisites

- Node.js 20+
- A Gmail account designated as the "agent mailbox"
- Google Cloud project with Gmail API enabled
- Claude API key from [Anthropic](https://console.anthropic.com/)
- Gmail app password for SMTP (or OAuth — app password is simpler)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd family-mail-agent
npm install
```

### 2. Google Cloud OAuth for Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Gmail API**
4. Go to **APIs & Services → Credentials**
5. Create an **OAuth 2.0 Client ID** (Desktop application)
6. Note the `Client ID` and `Client Secret`

### 3. Get a Refresh Token

Use the OAuth 2.0 Playground or a script to get a refresh token:

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon → check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. In Step 1, add scope: `https://www.googleapis.com/auth/gmail.readonly`
5. Authorize and exchange for tokens
6. Copy the **Refresh Token**

### 4. Gmail App Password (for sending email)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication if not already enabled
3. Go to **App passwords** and generate one for "Mail"
4. Copy the 16-character app password

### 5. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 6. Configure sender allowlist

Edit `config/agent.yml` to add allowed senders and domains. See [docs/CONFIG.md](docs/CONFIG.md).

### 7. Set up email forwarding

In the Gmail account you want to monitor, set up forwarding rules to send relevant emails to your agent mailbox. Alternatively, directly allowlist senders who email the agent mailbox.

## Running

### Build and run (compiled)

```bash
npm run build
npm start
```

### Run directly with tsx

```bash
npm run run:daily
```

### Dry-run mode (uses sample data, no Gmail/SMTP)

```bash
npm run run:dry
```

This loads sample emails from `test/fixtures/sample-emails.json` and skips sending the digest email. Useful for testing LLM classification and ICS generation.

### Daily cron

See [docs/CRON.md](docs/CRON.md) for cron setup instructions.

## Documentation

- [docs/CONFIG.md](docs/CONFIG.md) — Sender allowlist and sender profiles
- [docs/CRON.md](docs/CRON.md) — Scheduling daily runs
- [docs/PROMPTS.md](docs/PROMPTS.md) — LLM prompts and JSON schema
- [docs/SECURITY.md](docs/SECURITY.md) — Security model and safe operation rules

## Project Structure

```
family-mail-agent/
  config/agent.yml          # Sender allowlist, profiles, timezone
  data/state.json           # Runtime state (gitignored)
  src/
    index.ts                # Entry point
    config.ts               # YAML config loader
    types.ts                # Zod schemas and TypeScript types
    state/store.ts          # JSON file state persistence
    skills/
      gmail/                # Gmail API client and message fetching
      llm/                  # Claude client, prompts, decision extraction
      calendar/             # Event key generation and ICS file creation
      notify/               # Nodemailer SMTP and digest templates
    pipeline/runDaily.ts    # Orchestration pipeline
  test/fixtures/            # Sample emails for dry-run testing
  docs/                     # Documentation
```
