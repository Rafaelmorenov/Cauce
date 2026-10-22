import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Roles, TenantGuard } from "./auth.js";
import type { RequestIdentity } from "./auth.js";
import { PlatformService } from "./platform.service.js";

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
    @Body() body: { name?: string; dailyLimit?: number; controlPercentage?: number },
  ) {
    return this.platform.createCampaign(request.identity.tenantId, body);
  }

  @Post("campaigns/:id/approve-test")
  @Roles("admin", "aprobador")
  approveCampaignTest(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.approveCampaignTest(request.identity.tenantId, id);
  }

  @Post("campaigns/:id/activate")
  @Roles("admin", "operador_campanas")
  activateCampaign(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.activateCampaign(request.identity.tenantId, id);
  }

  @Post("campaigns/:id/pause")
  @Roles("admin", "operador_campanas")
  pauseCampaign(@Req() request: TenantRequest, @Param("id") id: string) {
    return this.platform.pauseCampaign(request.identity.tenantId, id);
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
