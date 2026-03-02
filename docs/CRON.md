# Running on a Schedule

## npm script

```bash
# One-time run
npm run run:daily

# Dry run (no Gmail/SMTP, uses sample data)
npm run run:dry
```

## Cron (Linux/macOS)

Run daily at 6:00 AM Pacific:

```bash
crontab -e
```

Add this line:

```cron
0 6 * * * cd /path/to/family-mail-agent && /usr/local/bin/node dist/index.js >> /var/log/family-mail-agent.log 2>&1
```

Or using npm:

```cron
0 6 * * * cd /path/to/family-mail-agent && /usr/local/bin/npm run start >> /var/log/family-mail-agent.log 2>&1
```

### Notes

- Make sure to build first: `npm run build`
- Ensure `.env` is present in the project directory
- The cron environment may not have the same PATH as your shell — use absolute paths for `node` and `npm`
- Redirect output to a log file for debugging

## launchd (macOS)

Create `~/Library/LaunchAgents/com.family-mail-agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.family-mail-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/family-mail-agent/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/family-mail-agent</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/family-mail-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/family-mail-agent.err</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.family-mail-agent.plist
```

## systemd (Linux)

Create `/etc/systemd/system/family-mail-agent.service`:

```ini
[Unit]
Description=Family Mail Agent Daily Run

[Service]
Type=oneshot
WorkingDirectory=/path/to/family-mail-agent
ExecStart=/usr/local/bin/node dist/index.js
EnvironmentFile=/path/to/family-mail-agent/.env
```

Create `/etc/systemd/system/family-mail-agent.timer`:

```ini
[Unit]
Description=Run Family Mail Agent daily at 6am

[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl enable --now family-mail-agent.timer
```

## Exit codes

- `0` — Success (all emails processed, digest sent)
- `1` — Fatal error (config missing, API auth failure, etc.)

Individual email processing failures are logged but do not cause a non-zero exit. The digest is still sent with whatever was successfully processed.
