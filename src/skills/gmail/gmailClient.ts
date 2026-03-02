import { google, type gmail_v1 } from "googleapis";

let _gmail: gmail_v1.Gmail | null = null;

export function getGmailClient(): gmail_v1.Gmail {
  if (_gmail) return _gmail;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  _gmail = google.gmail({ version: "v1", auth: oauth2Client });
  return _gmail;
}
