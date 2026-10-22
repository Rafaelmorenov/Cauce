import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  try {
    const content = readFileSync(resolve(".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // The validation below reports a precise missing configuration.
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env`);
  return value;
}

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return response.status === 204 ? (undefined as T) : await response.json() as T;
}

async function main() {
  loadLocalEnv();
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN");

  const token = await json<{ access_token: string; expires_in: number }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
  );
  const headers = { authorization: `Bearer ${token.access_token}` };

  const profile = await json<{ emailAddress: string; historyId: string }>(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers },
  );
  const messages = await json<{ messages?: Array<{ id: string }>; resultSizeEstimate: number }>(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=newer_than:7d",
    { headers },
  );
  const events = await json<{ items?: Array<{ id: string }> }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&timeMin=${encodeURIComponent(new Date().toISOString())}&singleEvents=true`,
    { headers },
  );

  let sent = false;
  if (process.env.GOOGLE_SEND_TEST?.toLowerCase() === "true") {
    const recipient = requireEnv("GOOGLE_TEST_RECIPIENT");
    const raw = Buffer.from([
      `To: ${recipient}`,
      "Subject: Prueba técnica Cauce",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Este correo valida la conexión sandbox de Cauce. No es una campaña.",
    ].join("\r\n")).toString("base64url");
    await json<{ id: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    sent = true;
  }

  console.log(JSON.stringify({
    ok: true,
    mailbox: profile.emailAddress,
    tokenExpiresInSeconds: token.expires_in,
    recentMessagesVisible: messages.resultSizeEstimate,
    futureCalendarEventsVisible: events.items?.length ?? 0,
    testMessageSent: sent,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
