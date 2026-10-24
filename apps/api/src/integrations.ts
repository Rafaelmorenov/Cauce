import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  CalendarMeeting,
  ConversationMessage,
  Deal,
  MailMessage,
  ProspectCriteria,
  SentMessage,
  TemplateProposalRequest,
} from "@comercial/contracts";
import { channelToneSkill } from "@comercial/domain";
import type {
  CalendarConnector,
  CrmConnector,
  DataProvider,
  MailboxConnector,
} from "@comercial/domain";

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
  if (response.status === 202 || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export class MailboxError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
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

export const trialRecipient = "santiago.moreno@jumpcube.io";
const trialMailbox = "santiago.moreno@hcsoftware.ai";

export interface TrialMailbox {
  findSentTest(subject: string): Promise<{ sentAt: string } | null>;
  send(message: { to: string; subject: string; html: string; templateId: string }): Promise<{ providerId: string }>;
}

export async function connectMicrosoftMailbox(tenantId: string): Promise<TrialMailbox> {
  const directory = process.env.MICROSOFT_TENANT_ID?.trim();
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const refreshToken = process.env.MICROSOFT_REFRESH_TOKEN?.trim();
  if (!directory || !clientId || !refreshToken) {
    throw new MailboxError("El buzón de Microsoft no está conectado.", 503);
  }
  const token = await providerFetch<{ access_token: string }>(
    `https://login.microsoftonline.com/${directory}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "openid profile email offline_access User.Read Mail.Send Mail.Read",
      }),
    },
    "microsoft",
  );
  const profile = await providerFetch<{ mail?: string; userPrincipalName?: string }>(
    "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
    { headers: { authorization: `Bearer ${token.access_token}` } },
    "microsoft",
  );
  const mailbox = (profile.mail ?? profile.userPrincipalName ?? "").toLowerCase();
  if (mailbox !== trialMailbox) {
    throw new MailboxError("El buzón conectado no es el de la prueba.", 409);
  }
  const connector = new Microsoft365Connector(token.access_token);
  return {
    async findSentTest(subject: string) {
      const data = await providerFetch<{
        value?: Array<{
          subject?: string;
          sentDateTime?: string;
          toRecipients?: Array<{ emailAddress?: { address?: string } }>;
          internetMessageHeaders?: Array<{ name?: string; value?: string }>;
        }>;
      }>(
        "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=25&$select=subject,sentDateTime,toRecipients,internetMessageHeaders&$orderby=sentDateTime desc",
        { headers: { authorization: `Bearer ${token.access_token}` } },
        "microsoft",
      );
      const match = (data.value ?? []).find((message) => {
        const addressed = (message.toRecipients ?? []).some((item) =>
          item.emailAddress?.address?.toLowerCase() === trialRecipient);
        return addressed && message.subject === subject;
      });
      return match ? { sentAt: match.sentDateTime ?? new Date().toISOString() } : null;
    },
    send(message) {
      return connector.send({
        to: message.to,
        subject: message.subject,
        html: message.html,
      }, `cauce-test:${tenantId}:${trialRecipient}:${message.templateId}`);
    },
  };
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

const audienceInstructions = [
  "Eres el asistente de prospección de Cauce. Hablas español, con tono profesional y breve.",
  "Solo ayudas a definir una audiencia B2B. No buscas contactos, no prometes resultados y no ejecutas acciones de pago.",
  "Llama siempre la función registrar_audiencia.",
  "Antes de ready=true necesitas país, tamaño de empresa, al menos un cargo, un sector o empresas de ejemplo, y la cantidad máxima de contactos.",
  "Si falta alguno, ready=false, omite criteria y missing usa solo: pais, tamano, cargos, sector, cantidad.",
  "Pregunta como máximo dos datos por turno. No inventes el país ni la cantidad.",
  "Si nombran empresas de ejemplo, deduce el sector, explícalo en reply y guárdalas en includedCompanies.",
  "employeeRanges usa tramos como 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000 o 5001+.",
  "seniorities, si aplica, usa owner, founder, c_suite, vp, director, manager, senior o entry.",
  "contactLimit es el entero que pidió el usuario, entre 1 y 5000.",
].join(" ");

const audienceParameters = {
  type: "object",
  required: ["reply", "ready", "missing"],
  properties: {
    reply: { type: "string", description: "Respuesta breve en español para el usuario." },
    ready: { type: "boolean", description: "True solo cuando la audiencia está completa." },
    missing: {
      type: "array",
      items: { type: "string", enum: ["pais", "tamano", "cargos", "sector", "cantidad"] },
    },
    criteria: {
      type: "object",
      description: "Inclúyelo solo cuando ready es true.",
      required: ["countries", "employeeRanges", "jobTitles", "contactLimit"],
      properties: {
        countries: { type: "array", items: { type: "string" } },
        employeeRanges: { type: "array", items: { type: "string" } },
        jobTitles: { type: "array", items: { type: "string" } },
        seniorities: { type: "array", items: { type: "string" } },
        industries: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" } },
        includedCompanies: { type: "array", items: { type: "string" } },
        excludedCompanies: { type: "array", items: { type: "string" } },
        contactLimit: { type: "integer" },
      },
    },
  },
};

export class GeminiAssistant {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-3.5-flash-lite",
  ) {}

  async interpret(messages: ConversationMessage[]): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.request(messages);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ProviderError && (error.status === 503 || error.status === 429);
        if (!retryable || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1_200 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private async request(messages: ConversationMessage[]): Promise<unknown> {
    const thinkingConfig = this.model.startsWith("gemini-2.5")
      ? { thinkingBudget: 0 }
      : { thinkingLevel: "low" };
    let data: {
      candidates?: Array<{
        content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> };
      }>;
    };
    try {
      data = await providerFetch<{
        candidates?: Array<{
          content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> };
        }>;
      }>(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: audienceInstructions }] },
            contents: messages.map((message) => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content }],
            })),
            tools: [{
              functionDeclarations: [{
                name: "registrar_audiencia",
                description: "Registra la respuesta al usuario y los criterios solo cuando la audiencia está completa.",
                parameters: audienceParameters,
              }],
            }],
            toolConfig: {
              functionCallingConfig: {
                mode: "ANY",
                allowedFunctionNames: ["registrar_audiencia"],
              },
            },
            generationConfig: {
              maxOutputTokens: 1_500,
              thinkingConfig,
            },
          }),
        },
        "gemini",
      );
    } catch (error) {
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ProviderError("gemini", 504, "timeout", null);
      }
      throw error;
    }
    const call = data.candidates?.[0]?.content?.parts?.find(
      (part) => part.functionCall?.name === "registrar_audiencia",
    )?.functionCall;
    if (!call?.args) throw new Error("Gemini no devolvió la audiencia");
    return call.args;
  }

  async proposeTemplate(request: TemplateProposalRequest): Promise<unknown> {
    const audience = request.audience ? ` Audiencia: ${request.audience}` : "";
    const data = await this.generate<{
      candidates?: Array<{
        content?: { parts?: Array<{ functionCall?: { name?: string; args?: unknown } }> };
      }>;
    }>({
      system: [
        "Eres el redactor de plantillas de Cauce.",
        channelToneSkill,
        `Canal obligatorio: ${request.channel}. Tono obligatorio: ${request.tone}.`,
        "Llama siempre proponer_plantilla. No cambies el canal ni el tono.",
        "No envíes el mensaje ni busques contactos.",
      ].join(" "),
      tool: {
        name: "proponer_plantilla",
        description: "Entrega la plantilla propuesta para revisión humana.",
        parameters: {
          type: "object",
          required: ["name", "subject", "body", "note"],
          properties: {
            name: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
            note: { type: "string", description: "Por qué este texto corresponde al canal y al tono." },
          },
        },
      },
      userText: `${request.brief}${audience}`,
    });
    const call = data.candidates?.[0]?.content?.parts?.find(
      (part) => part.functionCall?.name === "proponer_plantilla",
    )?.functionCall;
    if (!call?.args) throw new Error("Gemini no devolvió la plantilla");
    return call.args;
  }

  private async generate<T>(input: {
    system: string;
    tool: { name: string; description: string; parameters: object };
    userText: string;
  }): Promise<T> {
    try {
      return await providerFetch<T>(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [{ role: "user", parts: [{ text: input.userText }] }],
            tools: [{ functionDeclarations: [input.tool] }],
            toolConfig: {
              functionCallingConfig: {
                mode: "ANY",
                allowedFunctionNames: [input.tool.name],
              },
            },
            generationConfig: {
              maxOutputTokens: 1_500,
              thinkingConfig: this.model.startsWith("gemini-2.5")
                ? { thinkingBudget: 0 }
                : { thinkingLevel: "low" },
            },
          }),
        },
        "gemini",
      );
    } catch (error) {
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ProviderError("gemini", 504, "timeout", null);
      }
      throw error;
    }
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
