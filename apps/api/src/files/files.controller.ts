import { Body, Controller, Get, Param, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { FilesService } from "./files.service.js";
import { StorageGateway } from "./storage.gateway.js";

type Ctx = Request & { userId: string; organizationId: string };
const beginDto = z.object({ filename: z.string().min(1), contentType: z.string().min(1), bytes: z.number().int().positive(), sha256: z.string().length(64) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard)
export class FilesController {
  constructor(private readonly files: FilesService, private readonly storage: StorageGateway) {}

  @Get("work-items/:id/attachments")
  list(@Req() r: Ctx, @Param("id") id: string) { return this.files.list(r.organizationId, r.userId, id); }

  /** Step 1 — reserve a version and get a single-use upload grant. */
  @Post("work-items/:id/attachments")
  begin(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(beginDto)) b: z.infer<typeof beginDto>) {
    return this.files.beginUpload(r.organizationId, r.userId, id, b);
  }

  /** Step 2 — stream bytes through the authenticated gateway; verify + clear quarantine. */
  @Put("files/upload/:token")
  async upload(@Req() r: Ctx, @Param("token") token: string, @Res() res: Response) {
    const version = await this.files.consumeGrant(token, "upload", r.organizationId, r.userId);

    // Stream to private storage while hashing to verify integrity.
    const hash = createHash("sha256");
    let bytes = 0;
    r.on("data", (c: Buffer) => { hash.update(c); bytes += c.length; });
    await this.storage.put(version.storageKey, r, version.contentType);
    await this.files.completeUpload(version.id, { bytes, sha256: hash.digest("hex") });
    res.json({ ok: true, versionId: version.id });
  }

  /** Get a single-use, short-lived download grant. */
  @Post("attachments/:versionId/download-grant")
  grant(@Req() r: Ctx, @Param("versionId") versionId: string) {
    return this.files.createDownloadGrant(r.organizationId, r.userId, versionId).then((token) => ({ token }));
  }

  /** Redeem a download grant; streams the private object. No public URL is ever exposed. */
  @Get("files/download/:token")
  async download(@Req() r: Ctx, @Param("token") token: string, @Res() res: Response) {
    const version = await this.files.consumeGrant(token, "download", r.organizationId, r.userId);
    const stream = await this.storage.get(version.storageKey);
    res.setHeader("Content-Type", version.contentType);
    res.setHeader("Content-Disposition", "attachment");
    stream.pipe(res);
  }
}
