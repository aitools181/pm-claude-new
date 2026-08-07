import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { FieldsService } from "./fields.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const defineField = z.object({
  key: z.string().min(1), name: z.string().min(1),
  fieldType: z.enum(["text", "number", "date", "checkbox", "select", "user", "url"]),
  required: z.boolean().optional(), visibility: z.enum(["all", "restricted"]).optional(),
  config: z.record(z.any()).optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  visibleToRoles: z.array(z.string()).optional(),
});
const setValue = z.object({ fieldId: z.string().uuid(), value: z.any() });
const defineType = z.object({ key: z.string().min(1), name: z.string().min(1), icon: z.string().optional(), parentTypeId: z.string().uuid().optional(), fields: z.array(z.object({ fieldId: z.string().uuid(), required: z.boolean().optional() })).optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class FieldsController {
  constructor(private readonly fields: FieldsService) {}

  @Post("custom-fields") @RequirePermission(CAPABILITIES.FIELDS_MANAGE)
  define(@Req() r: Ctx, @Body(new ZodPipe(defineField)) b: z.infer<typeof defineField>) { return this.fields.defineField(r.organizationId, r.userId, b); }

  @Get("custom-fields") @RequirePermission(CAPABILITIES.FIELDS_MANAGE)
  list(@Req() r: Ctx) { return this.fields.list(r.organizationId); }

  @Put("work-items/:id/custom-fields")
  setValue(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(setValue)) b: { fieldId: string; value: unknown }) {
    return this.fields.setValue(r.organizationId, r.userId, id, b.fieldId, b.value).then(() => ({ ok: true }));
  }

  @Get("work-items/:id/custom-fields")
  values(@Req() r: Ctx, @Param("id") id: string) { return this.fields.valuesForItem(r.organizationId, r.userId, id); }

  @Post("work-item-types") @RequirePermission(CAPABILITIES.TYPES_MANAGE)
  defineType(@Req() r: Ctx, @Body(new ZodPipe(defineType)) b: z.infer<typeof defineType>) { return this.fields.defineType(r.organizationId, r.userId, b); }
}
