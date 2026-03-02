# Family Mail Agent

A daily email-to-calendar bot that reads a dedicated Gmail mailbox, uses Claude to classify scheduling emails, creates Google Calendar events with invitations, and sends a digest to parents.

## How It Works

1. **Fetch** — Reads new emails from a Gmail mailbox via the Gmail API
2. **Filter** — Only processes emails from allowlisted senders/domains (or all senders if no allowlist configured)
3. **Classify** — Sends each email to Claude for structured JSON extraction (event details, classification)
4. **Calendar** — Creates Google Calendar events for high-confidence results; sends invitations to parent attendees automatically
5. **Notify** — Sends a digest email to parents summarizing what was added, what needs review, and what needs clarification
6. **Persist** — Saves cursor position and event mappings in `data/state.json`

Events with past dates are automatically skipped (no calendar entry created).

## Prerequisites

- Node.js 20+
- A Gmail account designated as the "agent mailbox"
- Google Cloud project with **Gmail API** and **Google Calendar API** enabled
- OAuth 2.0 Client ID (Desktop application)
- Claude API key from [Anthropic](https://console.anthropic.com/)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd family-mail-agent
npm install
```

### 2. Google Cloud OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Gmail API** and **Google Calendar API**
4. Go to **APIs & Services → Credentials**
5. Create an **OAuth 2.0 Client ID** (Desktop application)
6. Note the `Client ID` and `Client Secret`

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env`:
```
GMAIL_CLIENT_ID=<your client id>
GMAIL_CLIENT_SECRET=<your client secret>
GMAIL_USER=<agent mailbox email>
CLAUDE_API_KEY=<your claude api key>
PARENT_A_EMAIL=<parent 1 email>
PARENT_B_EMAIL=<parent 2 email>
```

### 4. Authorize

```bash
npm run auth
```

This opens a browser for Google sign-in (scopes: Gmail read, Gmail send, Calendar). Paste the resulting refresh token into `.env` as `GMAIL_REFRESH_TOKEN`.

If you need to re-authorize (e.g. after adding scopes), revoke access at https://myaccount.google.com/permissions first, then run `npm run auth` again.

### 5. Configure sender allowlist

Edit `config/agent.yml` to add allowed senders and domains. See [docs/CONFIG.md](docs/CONFIG.md).

### 6. Set up email forwarding

Forward relevant emails (school newsletters, activity notifications) to the agent mailbox. Parents can also send quick event notes directly to the agent mailbox — the agent will create calendar events from them.

## Running

### Run directly with tsx

```bash
npm run run:daily
```

### Dry-run mode (uses sample data, no Gmail/Calendar API calls)

```bash
npm run run:dry
```

### Build and run (compiled)

```bash
npm run build
npm start
```

## Scheduled Daily Run (macOS launchd)

The agent is configured to run daily at **6:00 PM** via macOS `launchd`.

**Plist location:** `~/Library/LaunchAgents/com.family-mail-agent.daily.plist`

### Useful commands

```bash
# Check if the job is scheduled
launchctl list | grep family-mail

# Trigger a manual run right now
launchctl start com.family-mail-agent.daily

# View logs
tail -f ~/Personal/family-mail-agent/data/daily-run.log

# Unschedule (removes the daily 6 PM run)
launchctl unload ~/Library/LaunchAgents/com.family-mail-agent.daily.plist

# Schedule (activates the daily 6 PM run)
launchctl load ~/Library/LaunchAgents/com.family-mail-agent.daily.plist

# Reschedule after editing the plist (unschedule + schedule)
launchctl unload ~/Library/LaunchAgents/com.family-mail-agent.daily.plist
launchctl load ~/Library/LaunchAgents/com.family-mail-agent.daily.plist
```

### Change the schedule

Edit `~/Library/LaunchAgents/com.family-mail-agent.daily.plist` and modify the `StartCalendarInterval` section:

```xml
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key>
  <integer>18</integer>   <!-- 6 PM, change as needed -->
  <key>Minute</key>
  <integer>0</integer>
</dict>
```

Then reschedule (unschedule + schedule).

**Note:** `launchd` will catch up on missed runs — if your Mac is asleep at 6 PM, the job runs when it wakes.

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
  data/daily-run.log        # Launchd job output (gitignored)
  src/
    index.ts                # Entry point
    config.ts               # YAML config loader
    types.ts                # Zod schemas and TypeScript types
    state/store.ts          # JSON file state persistence
    skills/
      gmail/                # Gmail API client and message fetching
      llm/                  # Claude client, prompts, decision extraction
      calendar/             # Google Calendar API client and event key generation
      notify/               # Nodemailer SMTP and digest templates
    pipeline/runDaily.ts    # Orchestration pipeline
  test/fixtures/            # Sample emails for dry-run testing
  docs/                     # Documentation
```
