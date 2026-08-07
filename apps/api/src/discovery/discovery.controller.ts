import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DiscoveryService } from "./discovery.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const customerDto = z.object({ name: z.string().min(1), externalRef: z.string().optional(), segment: z.string().optional(), weight: z.number().optional(), consentStatus: z.string().optional(), retentionUntil: z.string().datetime().optional(), metadata: z.record(z.unknown()).optional() });
const ideaDto = z.object({ parentIdeaId: z.string().uuid().optional(), kind: z.string().optional(), title: z.string().min(1), description: z.string().optional(), ownerUserId: z.string().uuid().optional(), impact: z.number().optional(), confidence: z.number().optional(), effort: z.number().positive().optional(), reach: z.number().optional(), customerWeight: z.number().optional(), tags: z.array(z.string()).optional() });
const insightDto = z.object({ customerId: z.string().uuid().optional(), sourceType: z.string().min(1), sourceRef: z.string().optional(), title: z.string().min(1), body: z.string().min(1), theme: z.string().optional(), private: z.boolean().optional(), metadata: z.record(z.unknown()).optional(), ideaIds: z.array(z.string().uuid()).optional() });
const linkInsightDto = z.object({ insightId: z.string().uuid(), relevance: z.number().min(0).max(1).optional() });
const voteDto = z.object({ value: z.number().int().min(-1).max(10) });
const formulaDto = z.object({ name: z.string().min(1), kind: z.enum(["rice", "wsjf", "weighted"]), weights: z.record(z.number()).optional() });
const mergeDto = z.object({ sourceIds: z.array(z.string().uuid()).min(1) });
const deliveryDto = z.object({ projectId: z.string().uuid().optional(), workItemId: z.string().uuid().optional(), relation: z.string().optional() });
const publishDto = z.object({ name: z.string().min(1), fields: z.array(z.string()).optional(), filters: z.record(z.unknown()).optional(), expiresAt: z.string().datetime().optional() });

@Controller("discovery")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}
  @Get() overview(@Req() r: Ctx) { return this.service.overview(r.organizationId); }
  @Post("customers") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) customer(@Req() r: Ctx, @Body(new ZodPipe(customerDto)) b: z.infer<typeof customerDto>) { return this.service.createCustomer(r.organizationId, b); }
  @Post("ideas") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) idea(@Req() r: Ctx, @Body(new ZodPipe(ideaDto)) b: z.infer<typeof ideaDto>) { return this.service.createIdea(r.organizationId, r.userId, b); }
  @Get("ideas/:id") detail(@Req() r: Ctx, @Param("id") id: string) { return this.service.ideaDetail(r.organizationId, r.userId, id); }
  @Post("insights") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) insight(@Req() r: Ctx, @Body(new ZodPipe(insightDto)) b: z.infer<typeof insightDto>) { return this.service.captureInsight(r.organizationId, r.userId, b); }
  @Post("ideas/:id/insights") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) link(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(linkInsightDto)) b: z.infer<typeof linkInsightDto>) { return this.service.linkInsight(r.organizationId, id, b.insightId, b.relevance); }
  @Post("ideas/:id/vote") vote(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(voteDto)) b: z.infer<typeof voteDto>) { return this.service.vote(r.organizationId, r.userId, id, b.value); }
  @Post("formulas") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) formula(@Req() r: Ctx, @Body(new ZodPipe(formulaDto)) b: z.infer<typeof formulaDto>) { return this.service.createFormula(r.organizationId, r.userId, b); }
  @Post("formulas/:id/score") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) score(@Req() r: Ctx, @Param("id") id: string) { return this.service.scoreAll(r.organizationId, id); }
  @Post("ideas/:id/merge") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) merge(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(mergeDto)) b: z.infer<typeof mergeDto>) { return this.service.mergeIdeas(r.organizationId, r.userId, id, b.sourceIds); }
  @Post("ideas/:id/delivery") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) delivery(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(deliveryDto)) b: z.infer<typeof deliveryDto>) { return this.service.linkDelivery(r.organizationId, r.userId, id, b); }
  @Post("roadmaps") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) publish(@Req() r: Ctx, @Body(new ZodPipe(publishDto)) b: z.infer<typeof publishDto>) { return this.service.publish(r.organizationId, r.userId, b); }
  @Post("roadmaps/:id/revoke") @RequirePermission(CAPABILITIES.DISCOVERY_MANAGE) revoke(@Req() r: Ctx, @Param("id") id: string) { return this.service.revoke(r.organizationId, id); }
}

@Controller("public/discovery-roadmaps")
export class PublicDiscoveryController {
  constructor(private readonly service: DiscoveryService) {}
  @Get(":token") roadmap(@Param("token") token: string) { return this.service.publicRoadmap(token); }
}
