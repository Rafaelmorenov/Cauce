import { loadLocalEnv, microsoftJson, requireEnv } from "./microsoft-env.js";

async function main() {
  loadLocalEnv();
  const tenantId = requireEnv("MICROSOFT_TENANT_ID");
  const clientId = requireEnv("MICROSOFT_CLIENT_ID");
  const refreshToken = requireEnv("MICROSOFT_REFRESH_TOKEN");
  const token = await microsoftJson<{ access_token: string; expires_in: number }>(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "openid profile email offline_access User.Read Mail.Send Mail.Read Calendars.Read",
      }),
    },
  );
  const headers = { authorization: `Bearer ${token.access_token}` };
  const profile = await microsoftJson<{ mail?: string; userPrincipalName: string }>(
    "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
    { headers },
  );
  const messages = await microsoftJson<{ "@odata.count"?: number }>(
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$count=true&$top=1&$select=id",
    { headers: { ...headers, ConsistencyLevel: "eventual" } },
  );
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 86_400_000);
  const events = await microsoftJson<{ value: unknown[] }>(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(now.toISOString())}&endDateTime=${encodeURIComponent(later.toISOString())}&$top=1&$select=id`,
    { headers },
  );

  let sent = false;
  if (process.env.MICROSOFT_SEND_TEST?.toLowerCase() === "true") {
    const recipient = requireEnv("MICROSOFT_TEST_RECIPIENT");
    await microsoftJson<void>("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: "Prueba técnica Cauce",
          body: { contentType: "Text", content: "Este correo valida la conexión sandbox de Cauce. No es una campaña." },
          toRecipients: [{ emailAddress: { address: recipient } }],
        },
        saveToSentItems: true,
      }),
    });
    sent = true;
  }

  console.log(JSON.stringify({
    ok: true,
    mailbox: profile.mail ?? profile.userPrincipalName,
    tokenExpiresInSeconds: token.expires_in,
    inboxSampleAvailable: messages["@odata.count"] !== undefined,
    futureCalendarEventsVisible: events.value.length,
    testMessageSent: sent,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
