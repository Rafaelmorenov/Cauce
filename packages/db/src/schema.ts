import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended", "disabled"]);
export const prospectStatus = pgEnum("prospect_status", [
  "borrador", "en_revision", "aprobada", "en_ejecucion", "lista", "fallida",
]);
export const campaignStatus = pgEnum("campaign_status", [
  "borrador", "prueba_pendiente", "aprobada", "activa", "pausada", "detenida", "completada",
]);
export const sendStatus = pgEnum("send_status", [
  "pendiente", "tomado", "enviado", "fallido", "cancelado", "suprimido",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull().default("America/Bogota"),
  locale: text("locale").notNull().default("es-CO"),
  status: tenantStatus("status").notNull().default("active"),
  monthlyContactLimit: integer("monthly_contact_limit").notNull().default(500),
  monthlyAiLimit: integer("monthly_ai_limit").notNull().default(100_000),
  attributionWindowDays: integer("attribution_window_days").notNull().default(90),
  controlGroupPercentage: integer("control_group_percentage").notNull().default(10),
  marginRate: numeric("margin_rate", { precision: 5, scale: 4 }),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex("users_provider_subject_uq").on(table.provider, table.providerSubject)]);

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("memberships_tenant_user_uq").on(table.tenantId, table.userId),
  index("memberships_tenant_idx").on(table.tenantId),
]);

export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  externalAccount: text("external_account"),
  status: text("status").notNull().default("pending"),
  encryptedSecret: text("encrypted_secret"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("connections_tenant_type_idx").on(table.tenantId, table.type)]);

export const usageLedger = pgTable("usage_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("usage_tenant_date_idx").on(table.tenantId, table.occurredAt)]);

export const processedJobs = pgTable("processed_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("processed_jobs_key_uq").on(table.tenantId, table.idempotencyKey)]);

export const prospectRequests = pgTable("prospect_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  criteria: jsonb("criteria").notNull(),
  summary: text("summary"),
  contactLimit: integer("contact_limit").notNull(),
  estimatedCredits: integer("estimated_credits").notNull().default(0),
  consumedCredits: integer("consumed_credits").notNull().default(0),
  status: prospectStatus("status").notNull().default("borrador"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("prospects_tenant_status_idx").on(table.tenantId, table.status)]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedDomain: text("normalized_domain"),
  industry: text("industry"),
  country: text("country"),
  employeeRange: text("employee_range"),
  source: text("source").notNull(),
  externalId: text("external_id"),
  ...timestamps,
}, (table) => [
  uniqueIndex("organizations_tenant_domain_uq").on(table.tenantId, table.normalizedDomain),
]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  title: text("title"),
  email: text("email"),
  emailStatus: text("email_status"),
  status: text("status").notNull().default("nuevo"),
  source: text("source").notNull(),
  externalId: text("external_id"),
  ...timestamps,
}, (table) => [
  uniqueIndex("contacts_tenant_email_uq").on(table.tenantId, table.email),
  index("contacts_tenant_status_idx").on(table.tenantId, table.status),
]);

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("email"),
  ...timestamps,
});

export const templateVersions = pgTable("template_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("borrador"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex("template_versions_uq").on(table.tenantId, table.templateId, table.version)]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: campaignStatus("status").notNull().default("borrador"),
  mailboxConnectionId: uuid("mailbox_connection_id").references(() => connections.id),
  timeZone: text("time_zone").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(40),
  batchSize: integer("batch_size").notNull().default(5),
  testApprovedAt: timestamp("test_approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("campaigns_tenant_status_idx").on(table.tenantId, table.status)]);

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  waitBusinessDays: integer("wait_business_days").notNull().default(0),
  templateVersionId: uuid("template_version_id").notNull().references(() => templateVersions.id),
  ...timestamps,
}, (table) => [uniqueIndex("sequence_steps_position_uq").on(table.tenantId, table.campaignId, table.position)]);

export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  group: text("group").notNull().default("tratamiento"),
  status: text("status").notNull().default("activo"),
  currentStep: integer("current_step").notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex("enrollments_campaign_contact_uq").on(table.tenantId, table.campaignId, table.contactId),
]);

export const sends = pgTable("sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id),
  stepId: uuid("step_id").notNull().references(() => sequenceSteps.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: sendStatus("status").notNull().default("pendiente"),
  claimedUntil: timestamp("claimed_until", { withTimezone: true }),
  providerId: text("provider_id"),
  internetMessageId: text("internet_message_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  error: text("error"),
  ...timestamps,
}, (table) => [
  uniqueIndex("sends_enrollment_step_uq").on(table.tenantId, table.enrollmentId, table.stepId),
  uniqueIndex("sends_idempotency_uq").on(table.idempotencyKey),
  index("sends_due_idx").on(table.tenantId, table.status, table.scheduledAt),
]);

export const suppressions = pgTable("suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  kind: text("kind").notNull().default("email"),
  reason: text("reason").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("suppressions_value_uq").on(table.tenantId, table.kind, table.value)]);

export const inboxEvents = pgTable("inbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => connections.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  providerId: text("provider_id").notNull(),
  type: text("type").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  source: text("source").notNull(),
  reviewStatus: text("review_status").notNull().default("pending"),
  payload: jsonb("payload").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("inbox_events_provider_uq").on(table.tenantId, table.connectionId, table.providerId),
  index("inbox_events_review_idx").on(table.tenantId, table.reviewStatus),
]);

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id),
  providerId: text("provider_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  matchConfidence: numeric("match_confidence", { precision: 5, scale: 4 }),
  ...timestamps,
}, (table) => [uniqueIndex("meetings_provider_uq").on(table.tenantId, table.providerId)]);

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  externalId: text("external_id"),
  organizationDomain: text("organization_domain").notNull(),
  contactEmail: text("contact_email"),
  value: numeric("value", { precision: 18, scale: 2 }),
  valueMin: numeric("value_min", { precision: 18, scale: 2 }),
  valueMax: numeric("value_max", { precision: 18, scale: 2 }),
  currency: text("currency").notNull().default("COP"),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
  existedBeforeCampaign: boolean("existed_before_campaign").notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("deals_external_uq").on(table.tenantId, table.source, table.externalId)]);

export const attributions = pgTable("attributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  type: text("type").notNull(),
  withinWindow: boolean("within_window").notNull(),
  inControlGroup: boolean("in_control_group").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("attributions_deal_campaign_uq").on(table.tenantId, table.dealId, table.campaignId)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: uuid("object_id"),
  detail: jsonb("detail").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_tenant_date_idx").on(table.tenantId, table.occurredAt)]);
