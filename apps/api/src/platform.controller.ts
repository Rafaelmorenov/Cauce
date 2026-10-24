import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Roles, TenantGuard } from "./auth.js";
import type { RequestIdentity } from "./auth.js";
import { connectMicrosoftMailbox, GeminiAssistant, MailboxError, ProviderError } from "./integrations.js";
import { PlatformService } from "./platform.service.js";
import { trialSubject } from "./trial-email.js";

type TenantRequest = Request & { identity: RequestIdentity };

@Controller()
export class HealthController {
  @Get("health")
  health() {
    return { status: "ok", service: "comercial-api", timestamp: new Date().toISOString() };
  }
}

@UseGuards(TenantGuard)
@Controller("v1")
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("dashboard")
  dashboard(@Req() request: TenantRequest) {
    return this.platform.dashboard(request.identity.tenantId);
  }

  @Get("contacts")
  listContacts(@Req() request: TenantRequest) {
    return this.platform.listContacts(request.identity.tenantId);
  }

  @Post("contacts/import")
  @Roles("admin", "operador_campanas")
  importContacts(@Req() request: TenantRequest, @Body() body: unknown) {
    return this.platform.importContacts(request.identity.tenantId, body);
  }

  @Get("prospects")
  listProspects(@Req() request: TenantRequest) {
    return this.platform.listProspects(request.identity.tenantId);
  }

  @Post("assistant/conversation")
  @Roles("admin", "operador_campanas")
  interpretAudience(@Req() request: TenantRequest, @Body() body: unknown) {
    const key = process.env.GEMINI_API_KEY?.trim();
    const assistant = key
      ? new GeminiAssistant(key, process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite")
      : null;
    return this.platform.interpretAudience(request.identity.tenantId, body, assistant);
  }

  @Post("assistant/template")
  @Roles("admin", "operador_campanas")
  proposeTemplate(@Req() request: TenantRequest, @Body() body: unknown) {
    const key = process.env.GEMINI_API_KEY?.trim();
    const assistant = key
      ? new GeminiAssistant(key, process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite")
      : null;
    return this.platform.proposeTemplate(request.identity.tenantId, body, assistant);
  }

  @Post("prospects")
  @Roles("admin", "operador_campanas")
  createProspect(@Req() request: TenantRequest, @Body() body: unknown) {
    return this.platform.createProspect(request.identity.tenantId, body);
  }

  @Post("prospects/:id/approve")
  @Roles("admin", "aprobador")
  approveProspect(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.approveProspect(request.identity.tenantId, id);
  }

  @Get("templates")
  listTemplates(@Req() request: TenantRequest) {
    return this.platform.listTemplates(request.identity.tenantId);
  }

  @Post("templates")
  @Roles("admin", "operador_campanas")
  createTemplate(@Req() request: TenantRequest, @Body() body: unknown) {
    return this.platform.createTemplate(request.identity.tenantId, body);
  }

  @Post("templates/:id/preview")
  previewTemplate(
    @Req() request: TenantRequest,
    @Param("id") id: string,
    @Body() body: Record<string, string>,
  ) {
    return this.platform.previewTemplate(request.identity.tenantId, id, body);
  }

  @Get("mailbox/test-send")
  async testSendStatus(@Req() request: TenantRequest) {
    try {
      const mailbox = await connectMicrosoftMailbox(request.identity.tenantId);
      const found = await mailbox.findSentTest(trialSubject);
      if (found) this.platform.rememberFoundTest(request.identity.tenantId, found, trialSubject);
    } catch {
      // The form still loads when the mailbox cannot be read.
    }
    return this.platform.testSendStatus(request.identity.tenantId);
  }

  @Post("mailbox/test-send")
  @Roles("admin", "aprobador")
  async sendTestEmail(@Req() request: TenantRequest, @Body() body: unknown) {
    try {
      const mailbox = await connectMicrosoftMailbox(request.identity.tenantId);
      return await this.platform.sendTestEmail(request.identity.tenantId, body, mailbox);
    } catch (error) {
      if (error instanceof MailboxError || error instanceof ProviderError) {
        if (error instanceof ProviderError) {
          const detail = error.detail.replace(/access_token|refresh_token|Bearer\s+\S+/gi, "[redacted]").slice(0, 300);
          console.error(`microsoft ${error.status} ${detail}`);
        }
        throw new HttpException(
          error instanceof MailboxError ? error.message : "No se pudo usar el buzón de Microsoft.",
          error instanceof MailboxError ? error.status : 502,
        );
      }
      throw error;
    }
  }

  @Post("templates/:id/approve")
  @Roles("admin", "aprobador")
  approveTemplate(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.approveTemplate(request.identity.tenantId, id);
  }

  @Get("campaigns")
  listCampaigns(@Req() request: TenantRequest) {
    return this.platform.listCampaigns(request.identity.tenantId);
  }

  @Post("campaigns")
  @Roles("admin", "operador_campanas")
  createCampaign(
    @Req() request: TenantRequest,
    @Body() body: {
      name?: string;
      dailyLimit?: number;
      controlPercentage?: number;
      sendDays?: number[];
      sendStartHour?: number;
      sendEndHour?: number;
    },
  ) {
    return this.platform.createCampaign(request.identity.tenantId, body);
  }

  @Post("campaigns/:id/approve-test")
  @Roles("admin", "aprobador")
  approveCampaignTest(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.approveCampaignTest(request.identity.tenantId, id);
  }

  @Post("campaigns/process")
  @Roles("admin", "operador_campanas")
  processCampaigns(@Req() request: TenantRequest) {
    return this.processTenantCampaigns(request.identity.tenantId);
  }

  @Post("campaigns/:id/activate")
  @Roles("admin", "operador_campanas")
  async activateCampaign(
    @Req() request: TenantRequest,
    @Param("id") id: string,
    @Body() body: { templateId?: string },
  ) {
    await this.rememberTrialSend(request.identity.tenantId);
    const campaign = this.platform.activateCampaign(request.identity.tenantId, id, body.templateId);
    const cycle = await this.processTenantCampaigns(request.identity.tenantId);
    return { campaign, cycle };
  }

  @Post("campaigns/:id/pause")
  @Roles("admin", "operador_campanas")
  pauseCampaign(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.pauseCampaign(request.identity.tenantId, id);
  }

  private async rememberTrialSend(tenantId: string) {
    if (this.platform.testSendStatus(tenantId).sends.length > 0) return;
    try {
      const mailbox = await connectMicrosoftMailbox(tenantId);
      const found = await mailbox.findSentTest(trialSubject);
      if (found) this.platform.rememberFoundTest(tenantId, found, trialSubject);
    } catch {
      // Activation still explains that the test email is missing.
    }
  }

  private async processTenantCampaigns(tenantId: string) {
    const now = new Date();
    const preview = await this.platform.previewCampaignSends(tenantId, now);
    if (preview.sent === 0) return preview;
    try {
      const mailbox = await connectMicrosoftMailbox(tenantId);
      return await this.platform.runCampaignSends(tenantId, mailbox, now);
    } catch (error) {
      if (error instanceof MailboxError || error instanceof ProviderError) {
        throw new HttpException(
          error instanceof MailboxError ? error.message : "No se pudo usar el buzón de Microsoft.",
          error instanceof MailboxError ? error.status : 502,
        );
      }
      throw error;
    }
  }

  @Post("inbox/classify")
  @Roles("admin", "operador_campanas")
  classify(@Body() body: unknown) {
    return this.platform.classifyMessage(body);
  }

  @Post("sales/attribute")
  @Roles("admin", "vendedor")
  attribute(@Body() body: unknown) {
    return this.platform.attribute(body);
  }

  @Post("sales/roi")
  roi(@Body() body: { attributedRevenue?: number; marginRate?: number; periodCost?: number }) {
    return this.platform.roi(body);
  }

  @Post("campaigns/control-assignment")
  @Roles("admin", "operador_campanas")
  controlAssignment(
    @Body() body: { campaignSeed: string; contactId: string; percentage?: number },
  ) {
    return this.platform.controlAssignment(body);
  }
}
