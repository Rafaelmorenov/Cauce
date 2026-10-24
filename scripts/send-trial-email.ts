import { trialEmail, trialSubject } from "../apps/api/src/trial-email.ts";
import { loadLocalEnv, microsoftJson, requireEnv } from "./microsoft-env.ts";

const api = "http://localhost:3001";
const tenantId = "00000000-0000-4000-8000-000000000010";
const headers = {
  "content-type": "application/json",
  "x-tenant-id": tenantId,
  "x-role": "admin",
};

async function main() {
  const contacts = await request<Array<{ id: string; email?: string }>>("/v1/contacts");
  const contact = contacts.find((item) => item.email?.toLowerCase() === "santiago.moreno@jumpcube.io");
  if (!contact) throw new Error("Santiago Moreno no está en la base.");
  const template = await request<{ id: string }>("/v1/templates", {
    method: "POST",
    body: JSON.stringify(trialEmail),
  });
  await request(`/v1/templates/${template.id}/approve`, { method: "POST" });
  const sent = await request<{
    sent: boolean;
    alreadySent: boolean;
    recipient: string;
    subject: string;
  }>("/v1/mailbox/test-send", {
    method: "POST",
    body: JSON.stringify({ templateId: template.id, contactId: contact.id }),
  });
  if (sent.recipient !== "santiago.moreno@jumpcube.io" || sent.subject !== trialSubject) {
    throw new Error("El envío no coincidió con el destinatario o el asunto acordados.");
  }
  await new Promise((resolve) => setTimeout(resolve, 4_000));
  const found = await findInSentItems(sent.subject);
  console.log(JSON.stringify({
    recipient: sent.recipient,
    subject: sent.subject,
    alreadySent: sent.alreadySent,
    inSentItems: Boolean(found),
    sentDateTime: found?.sentDateTime ?? null,
  }));
  if (!found) process.exitCode = 1;
}

async function findInSentItems(subject: string) {
  loadLocalEnv();
  const token = await microsoftJson<{ access_token: string }>(
    `https://login.microsoftonline.com/${requireEnv("MICROSOFT_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireEnv("MICROSOFT_CLIENT_ID"),
        grant_type: "refresh_token",
        refresh_token: requireEnv("MICROSOFT_REFRESH_TOKEN"),
        scope: "openid profile email offline_access User.Read Mail.Send Mail.Read",
      }),
    },
  );
  const data = await microsoftJson<{
    value: Array<{
      subject?: string;
      sentDateTime?: string;
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
    }>;
  }>(
    "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=15&$select=subject,sentDateTime,toRecipients&$orderby=sentDateTime desc",
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  return data.value.find((message) =>
    message.subject === subject
    && message.toRecipients?.some((item) => item.emailAddress?.address?.toLowerCase() === "santiago.moreno@jumpcube.io"));
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const payload = await response.json().catch(() => ({} as { message?: string }));
  if (!response.ok) {
    throw new Error(payload.message ?? `La API respondió ${response.status}`);
  }
  return payload as T;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
