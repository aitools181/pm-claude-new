import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { FormsService } from "./forms.service.js";
import { SubmissionsService } from "./submissions.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createDto = z.object({ key: z.string().min(1), name: z.string().min(1), description: z.string().optional() });
const draftDto = z.object({ name: z.string().optional(), description: z.string().optional(), draftFields: z.array(z.any()).optional(), draftRouting: z.array(z.any()).optional(), defaultProjectId: z.string().uuid().nullable().optional(), defaultTypeId: z.string().uuid().nullable().optional() });
const submitDto = z.object({ answers: z.record(z.any()) });

@Controller("forms")
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class FormsController {
  constructor(private readonly forms: FormsService, private readonly subs: SubmissionsService) {}

  @Get() list(@Req() r: Ctx) { return this.forms.list(r.organizationId); }
  @Get(":id") get(@Req() r: Ctx, @Param("id") id: string) { return this.forms.get(r.organizationId, id); }

  @Post() @RequirePermission(CAPABILITIES.FORM_MANAGE)
  create(@Req() r: Ctx, @Body(new ZodPipe(createDto)) b: z.infer<typeof createDto>) { return this.forms.create(r.organizationId, r.userId, b); }
  @Patch(":id") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  update(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(draftDto)) b: z.infer<typeof draftDto>) { return this.forms.updateDraft(r.organizationId, id, b as any); }
  @Post(":id/publish") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  publish(@Req() r: Ctx, @Param("id") id: string) { return this.forms.publish(r.organizationId, r.userId, id); }
  @Post(":id/public") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  enablePublic(@Req() r: Ctx, @Param("id") id: string) { return this.forms.enablePublic(r.organizationId, id); }
  @Delete(":id/public") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  disablePublic(@Req() r: Ctx, @Param("id") id: string) { return this.forms.disablePublic(r.organizationId, id); }

  // internal submission — any authenticated member
  @Post(":id/submit")
  submit(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(submitDto)) b: z.infer<typeof submitDto>) { return this.subs.submitInternal(r.organizationId, r.userId, id, b.answers); }
  @Get(":id/submissions") @RequirePermission(CAPABILITIES.FORM_MANAGE)
  submissions(@Req() r: Ctx, @Param("id") id: string) { return this.subs.list(r.organizationId, id); }
}
