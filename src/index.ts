import "dotenv/config";
import { loadConfig } from "./config.js";
import { loadState } from "./state/store.js";
import { runDaily } from "./pipeline/runDaily.js";
import pino from "pino";

const log = pino({ name: "family-mail-agent" });

async function main(): Promise<void> {
  log.info("Family Mail Agent starting");

  // Load config and state early to catch errors
  try {
    loadConfig();
    log.info("Configuration loaded");
  } catch (err) {
    log.fatal({ err }, "Failed to load configuration");
    process.exit(1);
  }

  try {
    loadState();
    log.info("State loaded");
  } catch (err) {
    log.fatal({ err }, "Failed to load state");
    process.exit(1);
  }

  // Validate required env vars (unless dry run)
  const isDryRun = process.env.DRY_RUN === "true";
  if (!isDryRun) {
    const required = [
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
      "GMAIL_USER",
      "CLAUDE_API_KEY",
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      log.fatal({ missing }, "Missing required environment variables");
      process.exit(1);
    }
  } else {
    // Dry run still needs Claude API key
    if (!process.env.CLAUDE_API_KEY) {
      log.fatal("CLAUDE_API_KEY is required even in dry-run mode");
      process.exit(1);
    }
  }

  try {
    await runDaily();
    log.info("Daily run completed successfully");
    process.exit(0);
  } catch (err) {
    log.fatal({ err }, "Fatal error during daily run");
    process.exit(1);
  }
}

main();
