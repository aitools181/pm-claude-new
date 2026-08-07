import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { ProofingService } from "./proofing.service.js";
import { PortalService } from "./portal.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const assetDto = z.object({ name: z.string().min(1), fileRef: z.string().min(1), mimeType: z.string().optional(), workItemId: z.string().uuid().optional(), reapprovalOnUpdate: z.boolean().optional() });
const versionDto = z.object({ fileRef: z.string().min(1), mimeType: z.string().optional() });
const markerDto = z.object({ assetVersion: z.number().int().positive(), x: z.number(), y: z.number(), page: z.number().int().optional(), comment: z.string().optional() });
const reviewDto = z.object({ assetVersion: z.number().int().positive(), status: z.enum(["approved", "changes_requested"]), reason: z.string().optional() });
const msgDto = z.object({ body: z.string().min(1) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class ProofingController {
  constructor(private proof: ProofingService, private portal: PortalService) {}

  @Get("proof-assets") list(@Req() r: Ctx) { return this.proof.list(r.organizationId); }
  @Post("proof-assets") @RequirePermission(CAPABILITIES.PROOF_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(assetDto)) b: z.infer<typeof assetDto>) { return this.proof.createAsset(r.organizationId, b); }
  @Get("proof-assets/:id") get(@Req() r: Ctx, @Param("id") id: string) { return this.proof.get(r.organizationId, id); }
  @Post("proof-assets/:id/versions") @RequirePermission(CAPABILITIES.PROOF_MANAGE)
  addVersion(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(versionDto)) b: z.infer<typeof versionDto>) { return this.proof.addVersion(r.organizationId, id, b); }
  @Get("proof-assets/:id/markers") markers(@Req() r: Ctx, @Param("id") id: string, @Query("version") v: string) { return this.proof.listMarkers(r.organizationId, id, Number(v)); }
  @Post("proof-assets/:id/markers") @RequirePermission(CAPABILITIES.PROOF_MANAGE)
  addMarker(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(markerDto)) b: z.infer<typeof markerDto>) { return this.proof.addMarker(r.organizationId, id, r.userId, b); }
  @Post("proof-markers/:id/resolve") @RequirePermission(CAPABILITIES.PROOF_MANAGE)
  resolve(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ resolved: z.boolean() }))) b: { resolved: boolean }) { return this.proof.resolveMarker(r.organizationId, id, b.resolved); }
  @Get("proof-assets/:id/compare") compare(@Req() r: Ctx, @Param("id") id: string, @Query("a") a: string, @Query("b") b: string) { return this.proof.compare(r.organizationId, id, Number(a), Number(b)); }
  @Post("proof-assets/:id/review") @RequirePermission(CAPABILITIES.PROOF_MANAGE)
  review(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(reviewDto)) b: z.infer<typeof reviewDto>) { return this.proof.submitReview(r.organizationId, id, r.userId, b); }

  // internal portal (agent)
  @Get("submissions/:id/thread") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  thread(@Req() r: Ctx, @Param("id") id: string) { return this.portal.thread(r.organizationId, id); }
  @Post("submissions/:id/messages") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  agentMsg(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(msgDto)) b: z.infer<typeof msgDto>) { return this.portal.agentPostMessage(r.organizationId, r.userId, id, b.body); }
}

@Controller("public")
export class PortalPublicController {
  constructor(private portal: PortalService) {}
  @Get("requests/:ref/thread") thread(@Param("ref") ref: string) { return this.portal.publicThread(ref); }
  @Post("requests/:ref/messages") post(@Param("ref") ref: string, @Body(new ZodPipe(msgDto)) b: z.infer<typeof msgDto>) { return this.portal.publicPostMessage(ref, b.body); }
}
