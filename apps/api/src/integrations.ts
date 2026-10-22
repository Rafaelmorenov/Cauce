import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  CalendarMeeting,
  MailMessage,
  ProspectCriteria,
  SentMessage,
} from "@comercial/contracts";
import type {
  CalendarConnector,
  CrmConnector,
  DataProvider,
  MailboxConnector,
} from "@comercial/domain";
import { ProspectCriteriaSchema, type Deal } from "@comercial/contracts";

async function providerFetch<T>(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const detail = (await response.text()).slice(0, 1_000);
    throw new ProviderError(provider, response.status, detail, retryAfter);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly detail: string,
    readonly retryAfter: string | null,
  ) {
    super(`${provider} respondió ${status}`);
  }
}

export class SecretCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32) throw new Error("La clave de cifrado debe tener 32 bytes");
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((item) => item.toString("base64url")).join(".");
  }

  decrypt(envelope: string): string {
    const [ivValue, tagValue, ciphertextValue] = envelope.split(".");
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Secreto cifrado inválido");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

export class ApolloDataProvider implements DataProvider {
  constructor(private readonly apiKey: string) {}

  async preview(criteria: ProspectCriteria) {
    const result = await this.searchPeople(criteria);
    return {
      estimatedPeople: result.people.length,
      estimatedCredits: Math.min(criteria.contactLimit, result.people.length),
    };
  }

  async searchPeople(criteria: ProspectCriteria, cursor = "1") {
    const page = Number(cursor);
    const body = {
      person_titles: criteria.jobTitles,
      person_seniorities: criteria.seniorities,
      person_locations: criteria.countries,
      organization_num_employees_ranges: criteria.employeeRanges,
      q_organization_keyword_tags: criteria.industries,
      per_page: Math.min(100, criteria.contactLimit),
      page,
    };
    const data = await providerFetch<{
      people: Array<{
        id: string;
        first_name: string;
        last_name: string;
        title: string;
        organization?: { name: string; primary_domain?: string };
      }>;
      pagination?: { total_pages: number };
    }>("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    }, "apollo");

    return {
      people: data.people.map((person) => ({
        providerId: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        title: person.title,
        organizationName: person.organization?.name ?? "",
        ...(person.organization?.primary_domain
          ? { organizationDomain: person.organization.primary_domain }
          : {}),
      })),
      ...(data.pagination && page < data.pagination.total_pages
        ? { nextCursor: String(page + 1) }
        : {}),
    };
  }

  async enrichPeople(people: Parameters<DataProvider["enrichPeople"]>[0]) {
    if (people.length > 10) throw new Error("Apollo permite máximo 10 personas por lote");
    const details = people.map((person) => ({
      id: person.providerId,
      first_name: person.firstName,
      last_name: person.lastName,
      domain: person.organizationDomain,
    }));
    const data = await providerFetch<{
      matches: Array<{ id: string; email?: string; email_status?: string } | null>;
    }>("https://api.apollo.io/api/v1/people/bulk_match", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({ details, reveal_personal_emails: false, reveal_phone_number: false }),
    }, "apollo");
    const enriched = data.matches.flatMap((match) =>
      match
        ? [{
            providerId: match.id,
            ...(match.email ? { email: match.email } : {}),
            ...(match.email_status ? { emailStatus: match.email_status } : {}),
          }]
        : [],
    );
    return { people: enriched, creditsUsed: enriched.filter((person) => person.email).length };
  }
}

abstract class OAuthConnector {
  constructor(protected readonly accessToken: string) {}

  protected headers(extra: Record<string, string> = {}) {
    return { authorization: `Bearer ${this.accessToken}`, ...extra };
  }
}

export class GoogleWorkspaceConnector extends OAuthConnector implements MailboxConnector, CalendarConnector {
  async send(message: MailMessage, idempotencyKey: string): Promise<SentMessage> {
    const headers = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      "Content-Type: text/html; charset=utf-8",
      `X-Platform-Idempotency-Key: ${idempotencyKey}`,
      ...Object.entries(message.headers ?? {}).map(([key, value]) => `${key}: ${value}`),
      "",
      message.html,
    ];
    const raw = Buffer.from(headers.join("\r\n")).toString("base64url");
    const data = await providerFetch<{ id: string; threadId?: string }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ raw }),
      },
      "google",
    );
    return { providerId: data.id, ...(data.threadId ? { threadId: data.threadId } : {}) };
  }

  async listChanges(cursor?: string) {
    if (!cursor) return { messages: [], cursor: "initial-sync-required" };
    const data = await providerFetch<{ historyId: string }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded`,
      { headers: this.headers() },
      "google",
    );
    return { messages: [], cursor: data.historyId };
  }

  async listMeetings(since: Date, cursor?: string) {
    const params = new URLSearchParams({
      timeMin: since.toISOString(),
      singleEvents: "true",
      maxResults: "250",
    });
    if (cursor) params.set("pageToken", cursor);
    const data = await providerFetch<{
      items?: Array<{
        id: string;
        start: { dateTime?: string };
        end: { dateTime?: string };
        status?: string;
        attendees?: Array<{ email: string }>;
      }>;
      nextPageToken?: string;
    }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: this.headers(),
    }, "google");
    const meetings: CalendarMeeting[] = (data.items ?? []).flatMap((event) =>
      event.start.dateTime && event.end.dateTime
        ? [{
            providerId: event.id,
            startsAt: new Date(event.start.dateTime),
            endsAt: new Date(event.end.dateTime),
            attendeeEmails: (event.attendees ?? []).map((attendee) => attendee.email.toLowerCase()),
            status: event.status === "cancelled" ? "cancelada" : "agendada",
          }]
        : [],
    );
    return { meetings, ...(data.nextPageToken ? { cursor: data.nextPageToken } : {}) };
  }
}

export class Microsoft365Connector extends OAuthConnector implements MailboxConnector, CalendarConnector {
  async send(message: MailMessage, idempotencyKey: string): Promise<SentMessage> {
    await providerFetch<void>("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "HTML", content: message.html },
          toRecipients: [{ emailAddress: { address: message.to } }],
          internetMessageHeaders: [
            { name: "X-Platform-Idempotency-Key", value: idempotencyKey },
            ...Object.entries(message.headers ?? {}).map(([name, value]) => ({ name, value })),
          ],
        },
        saveToSentItems: true,
      }),
    }, "microsoft");
    return { providerId: idempotencyKey };
  }

  async listChanges(cursor?: string) {
    const url = cursor ?? "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$select=id,from,subject,bodyPreview,receivedDateTime,internetMessageHeaders";
    const data = await providerFetch<{
      value: Array<{
        id: string;
        from?: { emailAddress: { address: string } };
        subject?: string;
        bodyPreview?: string;
        receivedDateTime: string;
        internetMessageHeaders?: Array<{ name: string; value: string }>;
      }>;
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(url, { headers: this.headers() }, "microsoft");
    return {
      messages: data.value.map((message) => ({
        providerId: message.id,
        from: message.from?.emailAddress.address ?? "",
        subject: message.subject ?? "",
        text: message.bodyPreview ?? "",
        headers: Object.fromEntries((message.internetMessageHeaders ?? []).map((header) => [header.name, header.value])),
        receivedAt: new Date(message.receivedDateTime),
      })),
      cursor: data["@odata.deltaLink"] ?? data["@odata.nextLink"] ?? url,
    };
  }

  async listMeetings(since: Date, cursor?: string) {
    const url = cursor ?? `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(since.toISOString())}&endDateTime=${encodeURIComponent(new Date(since.getTime() + 90 * 86_400_000).toISOString())}`;
    const data = await providerFetch<{
      value: Array<{
        id: string;
        start: { dateTime: string };
        end: { dateTime: string };
        isCancelled?: boolean;
        attendees?: Array<{ emailAddress: { address: string } }>;
      }>;
      "@odata.nextLink"?: string;
    }>(url, { headers: this.headers() }, "microsoft");
    return {
      meetings: data.value.map((event): CalendarMeeting => ({
        providerId: event.id,
        startsAt: new Date(event.start.dateTime),
        endsAt: new Date(event.end.dateTime),
        attendeeEmails: (event.attendees ?? []).map((attendee) => attendee.emailAddress.address.toLowerCase()),
        status: event.isCancelled ? "cancelada" : "agendada",
      })),
      ...(data["@odata.nextLink"] ? { cursor: data["@odata.nextLink"] } : {}),
    };
  }
}

export class SqsJobPublisher {
  private readonly client: SQSClient;

  constructor(region: string) {
    this.client = new SQSClient({ region });
  }

  async publish(queueUrl: string, type: string, payload: object, idempotencyKey: string) {
    await this.client.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ version: 1, type, idempotencyKey, payload }),
      MessageAttributes: {
        type: { DataType: "String", StringValue: type },
      },
    }));
  }
}

export class AnthropicAssistant {
  constructor(
    private readonly apiKey: string,
    private readonly model = "claude-sonnet-4-5",
  ) {}

  async extractProspectCriteria(conversation: string): Promise<ProspectCriteria> {
    const data = await providerFetch<{
      content: Array<{ type: string; text?: string }>;
    }>("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1_500,
        system: [
          "Eres un asistente de prospección B2B en español.",
          "Devuelve solamente JSON válido con countries, employeeRanges, jobTitles,",
          "seniorities, industries, keywords, includedCompanies, excludedCompanies y contactLimit.",
          "No ejecutes búsquedas ni acciones con costo.",
        ].join(" "),
        messages: [{ role: "user", content: conversation }],
      }),
    }, "anthropic");
    const text = data.content.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("Anthropic no devolvió criterios");
    const json = text.replace(/^```json\s*|\s*```$/g, "");
    return ProspectCriteriaSchema.parse(JSON.parse(json));
  }
}

export class HubSpotCrmConnector extends OAuthConnector implements CrmConnector {
  async listWonDeals(since: Date, cursor?: string) {
    const body = {
      filterGroups: [{
        filters: [
          { propertyName: "dealstage", operator: "EQ", value: "closedwon" },
          { propertyName: "closedate", operator: "GTE", value: String(since.getTime()) },
        ],
      }],
      properties: ["amount", "closedate", "dealstage"],
      limit: 100,
      ...(cursor ? { after: cursor } : {}),
    };
    const data = await providerFetch<{
      results: Array<{
        id: string;
        properties: { amount?: string; closedate?: string };
      }>;
      paging?: { next?: { after: string } };
    }>("https://api.hubapi.com/crm/v3/objects/deals/search", {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    }, "hubspot");

    const deals: Deal[] = data.results.flatMap((deal) => {
      if (!deal.properties.closedate) return [];
      // Association resolution supplies domain/email in a second, bounded step.
      return [{
        organizationDomain: `hubspot-deal-${deal.id}.invalid`,
        ...(deal.properties.amount ? { value: Number(deal.properties.amount) } : {}),
        currency: "COP",
        closedAt: new Date(deal.properties.closedate),
        existedBeforeCampaign: false,
      }];
    });
    const next = data.paging?.next?.after;
    return { deals, ...(next ? { cursor: next } : {}) };
  }
}

export class CorporateOAuth {
  constructor(
    private readonly provider: "google" | "microsoft",
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  authorizationUrl(state: string, codeChallenge: string): string {
    const google = this.provider === "google";
    const url = new URL(google
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    const scopes = google
      ? ["openid", "email", "profile"]
      : ["openid", "email", "profile", "offline_access", "User.Read"];
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...(google ? { access_type: "offline", prompt: "consent" } : {}),
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string) {
    const endpoint = this.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    return providerFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
    }>(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
      }),
    }, this.provider);
  }
}
