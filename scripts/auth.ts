/**
 * One-time OAuth2 setup script.
 *
 * Usage:  npm run auth
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET set in .env
 *   - OAuth client type must be "Desktop app" in Google Cloud Console
 *
 * What it does:
 *   1. Opens your browser to the Google consent screen
 *   2. Starts a temporary local server on http://localhost:3000 to capture the redirect
 *   3. Exchanges the auth code for tokens
 *   4. Prints the refresh token — paste it into .env as GMAIL_REFRESH_TOKEN
 */

import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/calendar",
];

const REDIRECT_URI = "http://localhost:3000";

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env"
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\nOpening browser for Google sign-in...\n");
  console.log("If the browser doesn't open, visit this URL manually:");
  console.log(authUrl);
  console.log();

  // Open in default browser (macOS)
  exec(`open "${authUrl}"`);

  // Wait for the OAuth redirect
  const code = await waitForAuthCode();

  console.log("Auth code received, exchanging for tokens...\n");

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "Error: No refresh token returned. This can happen if you already granted access."
    );
    console.error(
      'Revoke access at https://myaccount.google.com/permissions and try again.'
    );
    process.exit(1);
  }

  console.log("Success! Add this to your .env file:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log();
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`
        );
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>"
        );
        server.close();
        resolve(code);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(3000, () => {
      console.log("Waiting for authorization on http://localhost:3000 ...\n");
    });

    server.on("error", (err) => {
      reject(
        new Error(
          `Could not start server on port 3000 — is something already running there? (${err.message})`
        )
      );
    });
  });
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
