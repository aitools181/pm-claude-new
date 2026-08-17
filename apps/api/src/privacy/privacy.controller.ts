import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { PrivacyService } from "./privacy.service.js";

type Ctx = Request & { userId: string; organizationId: string };

const dsrDto = z.object({ subjectUserId: z.string().uuid(), requestType: z.enum(["access", "rectification", "erasure", "restriction", "portability", "objection"]), notes: z.string().max(1000).optional() });
const holdDto = z.object({ scope: z.enum(["user", "project", "date_range", "query"]), scopeUserId: z.string().uuid().optional(), scopeProjectId: z.string().uuid().optional(), dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reason: z.string().trim().min(5).max(500) });
const releaseDto = z.object({ approvedByUserId: z.string().uuid() });
const consentDto = z.object({ purpose: z.string().min(1).max(80), version: z.string().min(1).max(20) });
const anonymiseDto = z.object({ dsrRequestId: z.string().uuid().optional() });

@Controller("privacy")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class PrivacyController {
  constructor(private readonly svc: PrivacyService) {}

  // ---- I.3.1 DSR ----
  @Get("dsr") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  listDsr(@Req() r: Ctx, @Query("status") status?: string) { return this.svc.listDsr(r.organizationId, status); }

  @Post("dsr") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  createDsr(@Req() r: Ctx, @Body(new ZodPipe(dsrDto)) b: z.infer<typeof dsrDto>) { return this.svc.createDsr(r.organizationId, r.userId, b); }

  @Post("dsr/:id/status") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  setDsrStatus(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ status: z.enum(["intake", "verifying", "in_progress", "completed", "rejected"]) }))) b: { status: string }) {
    return this.svc.setDsrStatus(r.organizationId, id, b.status);
  }

  @Post("dsr/:id/export") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  async exportDsr(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ subjectUserId: z.string().uuid() }))) b: { subjectUserId: string }) {
    return this.svc.exportSubjectData(r.organizationId, id, b.subjectUserId);
  }

  @Get("dsr/erasure-preview/:subjectUserId") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  erasurePreview(@Req() r: Ctx, @Param("subjectUserId") subjectUserId: string) { return this.svc.erasurePreview(r.organizationId, subjectUserId); }

  // ---- I.3.2 Anonymisation ----
  @Post("anonymise/:userId") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  anonymise(@Req() r: Ctx, @Param("userId") userId: string, @Body(new ZodPipe(anonymiseDto)) b: { dsrRequestId?: string }) {
    return this.svc.anonymise(r.organizationId, userId, r.userId, b.dsrRequestId);
  }
  @Get("anonymisation-runs") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  anonymisationRuns(@Req() r: Ctx) { return this.svc.listAnonymisationRuns(r.organizationId); }

  // ---- I.3.3 Legal Hold ----
  @Get("legal-holds") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  listHolds(@Req() r: Ctx) { return this.svc.listHolds(r.organizationId); }

  @Post("legal-holds") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  createHold(@Req() r: Ctx, @Body(new ZodPipe(holdDto)) b: z.infer<typeof holdDto>) { return this.svc.createHold(r.organizationId, r.userId, b); }

  @Post("legal-holds/:id/release") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  releaseHold(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(releaseDto)) b: { approvedByUserId: string }) {
    return this.svc.releaseHold(r.organizationId, id, r.userId, b.approvedByUserId);
  }

  // ---- I.3.4 Consent ----
  @Get("consent/:userId") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  listConsent(@Req() r: Ctx, @Param("userId") userId: string) { return this.svc.listConsent(r.organizationId, userId); }

  @Post("consent/:userId") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  recordConsent(@Req() r: Ctx, @Param("userId") userId: string, @Body(new ZodPipe(consentDto)) b: { purpose: string; version: string }) {
    return this.svc.recordConsent(r.organizationId, userId, b.purpose, b.version);
  }
  @Post("consent/:userId/withdraw") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE)
  withdrawConsent(@Req() r: Ctx, @Param("userId") userId: string, @Body(new ZodPipe(z.object({ purpose: z.string().min(1).max(80) }))) b: { purpose: string }) {
    return this.svc.withdrawConsent(r.organizationId, userId, b.purpose);
  }

  // ---- self-service: a member managing their own consent/data ----
  @Get("me/consent")
  myConsent(@Req() r: Ctx) { return this.svc.listConsent(r.organizationId, r.userId); }
  @Post("me/consent")
  setMyConsent(@Req() r: Ctx, @Body(new ZodPipe(consentDto)) b: { purpose: string; version: string }) { return this.svc.recordConsent(r.organizationId, r.userId, b.purpose, b.version); }
  @Post("me/consent/withdraw")
  withdrawMyConsent(@Req() r: Ctx, @Body(new ZodPipe(z.object({ purpose: z.string().min(1).max(80) }))) b: { purpose: string }) { return this.svc.withdrawConsent(r.organizationId, r.userId, b.purpose); }
}
