import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { demoContacts } from "@comercial/contracts";
import { AppModule } from "./app.module.js";
import { connectMicrosoftMailbox } from "./integrations.js";
import { PlatformService } from "./platform.service.js";
import { industrialEmail, trialEmail } from "./trial-email.js";

function loadLocalEnv(): void {
  const candidates = [".env", "../.env", "../../.env"].map((path) => resolve(process.cwd(), path));
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function bootstrap() {
  loadLocalEnv();
  const app = await NestFactory.create(AppModule, { cors: false });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header("x-request-id") ?? crypto.randomUUID();
    response.setHeader("x-request-id", requestId);
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("referrer-policy", "no-referrer");
    const started = performance.now();
    response.on("finish", () => {
      console.info(JSON.stringify({
        event: "http.request",
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
        tenantId: request.header("x-tenant-id") ?? "authenticated-token",
      }));
    });
    next();
  });
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "x-tenant-id", "x-role"],
  });
  app.enableShutdownHooks();
  const demoTenantId = "00000000-0000-4000-8000-000000000010";
  if (process.env.NODE_ENV !== "production") {
    const platform = app.get(PlatformService);
    platform.importContacts(demoTenantId, demoContacts);
    if (platform.listTemplates(demoTenantId).length === 0) {
      for (const draft of [trialEmail, industrialEmail]) {
        const template = platform.createTemplate(demoTenantId, draft);
        platform.approveTemplate(demoTenantId, template.id);
      }
    }
    setInterval(() => {
      void processDemoCampaigns(platform, demoTenantId);
    }, 5 * 60_000);
    setTimeout(() => {
      void processDemoCampaigns(platform, demoTenantId);
    }, 15_000);
  }
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

async function processDemoCampaigns(platform: PlatformService, tenantId: string) {
  const now = new Date();
  const preview = await platform.previewCampaignSends(tenantId, now);
  if (preview.sent === 0) return;
  try {
    const mailbox = await connectMicrosoftMailbox(tenantId);
    await platform.runCampaignSends(tenantId, mailbox, now);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudo procesar la campaña");
  }
}

void bootstrap();
