import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { AuthzGuard } from "../authz/authz.guard.js";
import { RequirePermission } from "../authz/require-permission.decorator.js";
import { CAPABILITIES } from "../authz/capabilities.js";
import { UxService } from "./ux.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const preferencesDto = z.object({
  themeMode: z.enum(["light","dark","system"]).optional(), chromeTone: z.enum(["black","gray","accent"]).optional(),
  colorPreset: z.string().max(40).optional(), customAccent: z.string().nullable().optional(), homeBackground: z.string().max(40).optional(),
  density: z.enum(["comfortable","compact"]).optional(), locale: z.string().max(12).optional(), personalWeekStart: z.number().int().min(0).max(6).nullable().optional(),
  notificationPopupSeconds: z.number().int().min(2).max(30).optional(), defaultLanding: z.enum(["/home","/my-tasks","/inbox","/projects","/goals","/portfolios"]).optional(),
  showRowNumbers: z.boolean().optional(), colorBlindMode: z.boolean().optional(), celebrations: z.boolean().optional(), inboxSummaryEnabled: z.boolean().optional(),
  inboxSummaryTimeframe: z.enum(["day","week","2weeks","month"]).optional(), navigationPreferences: z.record(z.unknown()).optional(), customTheme: z.record(z.unknown()).optional()
});
const widgetsDto = z.object({ widgets: z.array(z.object({ widgetKey: z.string(), enabled: z.boolean(), sortOrder: z.number().int(), size: z.string().optional(), config: z.record(z.unknown()).optional() })) });
const viewDto = z.object({ scopeType: z.enum(["inbox","my_tasks","project"]), scopeId: z.string().uuid().optional(), name: z.string().trim().min(1).max(100), viewType: z.string().optional(), filters: z.record(z.unknown()).optional(), columns: z.array(z.unknown()).optional(), sortSpec: z.record(z.unknown()).optional(), groupBy: z.string().nullable().optional(), isDefault: z.boolean().optional(), ownershipTier: z.enum(["personal","team","org"]).optional(), teamId: z.string().uuid().optional() });
const viewPatchDto = z.object({ name: z.string().trim().min(1).max(100).optional(), viewType: z.string().optional(), filters: z.record(z.unknown()).optional(), columns: z.array(z.unknown()).optional(), sortSpec: z.record(z.unknown()).optional(), groupBy: z.string().nullable().optional(), isDefault: z.boolean().optional() });
const sectionDto = z.object({ name: z.string().trim().min(1).max(200) });
const memberDto = z.object({ userId: z.string().uuid(), accessLevel: z.enum(["viewer","commenter","editor","project_admin"]).default("editor") });
const memberPatchDto = z.object({ accessLevel: z.enum(["viewer","commenter","editor","project_admin"]).optional(), notifyTasks: z.boolean().optional() });
const resourceDto = z.object({ kind: z.enum(["link","brief","file"]).optional(), name: z.string().trim().min(1).max(200), url: z.string().url().optional(), body: z.string().optional() });
const statusDto = z.object({ health: z.enum(["on_track","at_risk","off_track"]), title: z.string().trim().min(1).max(200), body: z.string().optional() });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)
export class UxController {
  constructor(private readonly ux: UxService) {}
  @Get("me/profile") profile(@Req() r: Ctx) { return this.ux.profile(r.organizationId, r.userId); }
  @Patch("me/profile") updateProfile(@Req() r: Ctx, @Body(new ZodPipe(z.object({ displayName: z.string().trim().min(1).max(200).optional(), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,32}$/).nullable().optional(), avatarUrl: z.string().trim().max(2000).nullable().optional(), designation: z.string().trim().max(150).nullable().optional(), department: z.string().trim().max(150).nullable().optional(), managerUserId: z.string().uuid().nullable().optional(), workingHours: z.record(z.unknown()).nullable().optional(), contactFields: z.record(z.unknown()).nullable().optional() }))) b: { displayName?: string; username?: string | null; avatarUrl?: string | null; designation?: string | null; department?: string | null; managerUserId?: string | null; workingHours?: Record<string, unknown> | null; contactFields?: Record<string, unknown> | null }) { return this.ux.updateProfile(r.organizationId, r.userId, b); }
  @Get("workspace/settings") workspaceSettings(@Req() r: Ctx) { return this.ux.workspaceSettings(r.organizationId); }
  @Patch("workspace/settings") @RequirePermission(CAPABILITIES.ORG_SETTINGS_MANAGE) updateWorkspaceSettings(@Req() r: Ctx, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(200).optional(), timezone: z.string().min(1).max(100).optional(), weekStart: z.number().int().min(0).max(6).optional(), dateFormat: z.string().max(40).optional(), timeFormat: z.enum(["24h","12h"]).optional(), numberFormat: z.string().max(30).optional(), workingDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(), fiscalYearStartMonth: z.number().int().min(1).max(12).optional(), retentionDays: z.number().int().min(1).max(3650).nullable().optional(), passwordPolicy: z.object({ minLength: z.number().int().min(10).max(128), requireUppercase: z.boolean(), requireDigit: z.boolean(), requireSymbol: z.boolean() }).nullable().optional(), coAssigneesEnabled: z.boolean().optional(), branding: z.record(z.unknown()).optional() }))) b: any) { return this.ux.updateWorkspaceSettings(r.organizationId, r.userId, b); }
  @Get("me/notification-preferences") notificationPreferences(@Req() r: Ctx) { return this.ux.notificationPreferences(r.organizationId, r.userId); }
  @Put("me/notification-preferences") setNotificationPreference(@Req() r: Ctx, @Body(new ZodPipe(z.object({ type: z.string().min(1).max(100), channel: z.enum(["inbox","email"]), enabled: z.boolean() }))) b: { type: string; channel: string; enabled: boolean }) { return this.ux.setNotificationPreference(r.organizationId, r.userId, b.type, b.channel, b.enabled); }

  @Get("me/email-forwarding") emailForwarding(@Req() r: Ctx) { return this.ux.emailForwarding(r.organizationId, r.userId); }
  @Patch("me/email-forwarding") updateEmailForwarding(@Req() r: Ctx, @Body(new ZodPipe(z.object({ enabled: z.boolean().optional(), destinationProjectId: z.string().uuid().nullable().optional() }))) b: { enabled?: boolean; destinationProjectId?: string | null }) { return this.ux.updateEmailForwarding(r.organizationId, r.userId, b); }
  @Get("me/emails") emailAddresses(@Req() r: Ctx) { return this.ux.emailAddresses(r.userId); }
  @Post("me/emails") addEmailAddress(@Req() r: Ctx, @Body(new ZodPipe(z.object({ email: z.string().email(), label: z.string().trim().max(40).optional() }))) b: { email: string; label?: string }) { return this.ux.addEmailAddress(r.userId, b.email, b.label); }
  @Post("me/emails/verify") verifyEmailAddress(@Req() r: Ctx, @Body(new ZodPipe(z.object({ token: z.string().min(20) }))) b: { token: string }) { return this.ux.verifyEmailAddress(r.userId, b.token); }
  @Post("me/emails/:id/make-primary") makePrimaryEmail(@Req() r: Ctx, @Param("id") id: string) { return this.ux.makePrimaryEmail(r.userId, id); }
  @Delete("me/emails/:id") removeEmailAddress(@Req() r: Ctx, @Param("id") id: string) { return this.ux.removeEmailAddress(r.userId, id).then(() => ({ ok: true })); }
  @Post("me/account-merge") mergeAccount(@Req() r: Ctx, @Body(new ZodPipe(z.object({ email: z.string().email(), password: z.string().min(1) }))) b: { email: string; password: string }) { return this.ux.mergeAccount(r.userId, b.email, b.password); }
  @Get("me/workspaces") myWorkspaces(@Req() r: Ctx) { return this.ux.myWorkspaces(r.userId); }

  @Get("ui/preferences") preferences(@Req() r: Ctx) { return this.ux.preferences(r.organizationId, r.userId); }
  @Patch("ui/preferences") updatePreferences(@Req() r: Ctx, @Body(new ZodPipe(preferencesDto)) b: z.infer<typeof preferencesDto>) { return this.ux.updatePreferences(r.organizationId, r.userId, b); }
  @Get("ui/home-widgets") widgets(@Req() r: Ctx) { return this.ux.homeWidgets(r.organizationId, r.userId); }
  @Put("ui/home-widgets") saveWidgets(@Req() r: Ctx, @Body(new ZodPipe(widgetsDto)) b: z.infer<typeof widgetsDto>) { return this.ux.saveHomeWidgets(r.organizationId, r.userId, b.widgets); }
  @Get("ui/saved-views") savedViews(@Req() r: Ctx, @Query("scopeType") scopeType: string, @Query("scopeId") scopeId?: string) { return this.ux.listSavedViews(r.organizationId, r.userId, scopeType, scopeId); }
  @Post("ui/saved-views") createSavedView(@Req() r: Ctx, @Body(new ZodPipe(viewDto)) b: z.infer<typeof viewDto>) { return this.ux.createSavedView(r.organizationId, r.userId, b); }
  @Patch("ui/saved-views/:id") updateSavedView(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(viewPatchDto)) b: z.infer<typeof viewPatchDto>) { return this.ux.updateSavedView(r.organizationId, r.userId, id, b); }
  @Post("ui/saved-views/:id/duplicate") duplicateSavedView(@Req() r: Ctx, @Param("id") id: string) { return this.ux.duplicateSavedView(r.organizationId, r.userId, id); }
  @Delete("ui/saved-views/:id") removeSavedView(@Req() r: Ctx, @Param("id") id: string) { return this.ux.deleteSavedView(r.organizationId, r.userId, id).then(() => ({ ok: true })); }

  @Get("workspace/storage-usage") storageUsage(@Req() r: Ctx) { return this.ux.storageUsage(r.organizationId); }
  @Get("directory/teams") teams(@Req() r: Ctx) { return this.ux.teams(r.organizationId); }
  @Post("directory/teams") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) createTeam(@Req() r: Ctx, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(150), leaderUserId: z.string().uuid().nullable().optional(), parentTeamId: z.string().uuid().nullable().optional(), description: z.string().trim().max(1000).nullable().optional() }))) b: { name: string; leaderUserId?: string | null; parentTeamId?: string | null; description?: string | null }) { return this.ux.createTeam(r.organizationId, r.userId, b); }
  @Patch("directory/teams/:teamId") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) updateTeam(@Req() r: Ctx, @Param("teamId") teamId: string, @Body(new ZodPipe(z.object({ name: z.string().trim().min(1).max(150).optional(), leaderUserId: z.string().uuid().nullable().optional(), parentTeamId: z.string().uuid().nullable().optional(), description: z.string().trim().max(1000).nullable().optional() }))) b: { name?: string; leaderUserId?: string | null; parentTeamId?: string | null; description?: string | null }) { return this.ux.updateTeam(r.organizationId, r.userId, teamId, b); }
  @Delete("directory/teams/:teamId") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) deleteTeam(@Req() r: Ctx, @Param("teamId") teamId: string) { return this.ux.deleteTeam(r.organizationId, r.userId, teamId); }
  @Get("directory/teams/:teamId/members") teamMembers(@Req() r: Ctx, @Param("teamId") teamId: string) { return this.ux.teamMembers(r.organizationId, teamId); }
  @Post("directory/teams/:teamId/members") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) addTeamMember(@Req() r: Ctx, @Param("teamId") teamId: string, @Body(new ZodPipe(z.object({ userId: z.string().uuid(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }))) b: { userId: string; effectiveFrom?: string | null; effectiveTo?: string | null }) { return this.ux.addTeamMember(r.organizationId, r.userId, teamId, b); }
  @Delete("directory/teams/:teamId/members/:memberUserId") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) removeTeamMember(@Req() r: Ctx, @Param("teamId") teamId: string, @Param("memberUserId") memberUserId: string) { return this.ux.removeTeamMember(r.organizationId, r.userId, teamId, memberUserId); }
  @Get("directory/members/:memberUserId/owned-summary") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) ownedSummary(@Req() r: Ctx, @Param("memberUserId") memberUserId: string) { return this.ux.ownedSummary(r.organizationId, memberUserId); }
  @Post("directory/members/:memberUserId/deactivate") @RequirePermission(CAPABILITIES.TEAMS_MANAGE) deactivateMember(@Req() r: Ctx, @Param("memberUserId") memberUserId: string, @Body(new ZodPipe(z.object({ reassignToUserId: z.string().uuid(), reason: z.string().trim().max(500).optional() }))) b: { reassignToUserId: string; reason?: string }) { return this.ux.deactivateMember(r.organizationId, r.userId, memberUserId, b); }
  @Get("directory/members") directory(@Req() r: Ctx) { return this.ux.directory(r.organizationId); }
  @Get("projects/:id/sections") sections(@Req() r: Ctx, @Param("id") id: string) { return this.ux.sections(r.organizationId, r.userId, id); }
  @Post("projects/:id/sections") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) createSection(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(sectionDto)) b: z.infer<typeof sectionDto>) { return this.ux.createSection(r.organizationId, r.userId, id, b.name); }
  @Patch("projects/:id/sections/:sectionId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) updateSection(@Req() r: Ctx, @Param("id") id: string, @Param("sectionId") sectionId: string, @Body(new ZodPipe(sectionDto.partial())) b: { name?: string }) { return this.ux.updateSection(r.organizationId, r.userId, id, sectionId, b); }
  @Delete("projects/:id/sections/:sectionId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) removeSection(@Req() r: Ctx, @Param("id") id: string, @Param("sectionId") sectionId: string) { return this.ux.deleteSection(r.organizationId, r.userId, id, sectionId).then(() => ({ ok: true })); }
  @Patch("work-items/:id/section") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) moveSection(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ sectionId: z.string().uuid().nullable() }))) b: { sectionId: string | null }) { return this.ux.moveToSection(r.organizationId, r.userId, id, b.sectionId); }

  @Post("projects/:id/join") joinProject(@Req() r: Ctx, @Param("id") id: string) { return this.ux.joinProject(r.organizationId, r.userId, id); }
  @Delete("projects/:id/join") leaveProject(@Req() r: Ctx, @Param("id") id: string) { return this.ux.leaveProject(r.organizationId, r.userId, id); }
  @Get("projects/:id/members") members(@Req() r: Ctx, @Param("id") id: string) { return this.ux.projectMembers(r.organizationId, r.userId, id); }
  @Post("projects/:id/members") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) addMember(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(memberDto)) b: z.infer<typeof memberDto>) { return this.ux.addProjectMember(r.organizationId, r.userId, id, b.userId, b.accessLevel); }
  @Patch("projects/:id/members/:memberId") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) updateMember(@Req() r: Ctx, @Param("id") id: string, @Param("memberId") memberId: string, @Body(new ZodPipe(memberPatchDto)) b: z.infer<typeof memberPatchDto>) { return this.ux.updateProjectMember(r.organizationId, r.userId, id, memberId, b); }
  @Delete("projects/:id/members/:memberId") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) removeMember(@Req() r: Ctx, @Param("id") id: string, @Param("memberId") memberId: string) { return this.ux.removeProjectMember(r.organizationId, r.userId, id, memberId).then(() => ({ ok: true })); }
  @Get("projects/favorites") favorites(@Req() r: Ctx) { return this.ux.favorites(r.organizationId, r.userId); }
  @Put("projects/:id/favorite") favorite(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ favorite: z.boolean() }))) b: { favorite: boolean }) { return this.ux.favorite(r.organizationId, r.userId, id, b.favorite); }

  @Get("projects/:id/status-updates") updates(@Req() r: Ctx, @Param("id") id: string) { return this.ux.statusUpdates(r.organizationId, r.userId, id); }
  @Post("projects/:id/status-updates") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) addUpdate(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(statusDto)) b: z.infer<typeof statusDto>) { return this.ux.addStatusUpdate(r.organizationId, r.userId, id, b); }
  @Get("projects/:id/resources") resources(@Req() r: Ctx, @Param("id") id: string) { return this.ux.resources(r.organizationId, r.userId, id); }
  @Post("projects/:id/resources") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) addResource(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(resourceDto)) b: z.infer<typeof resourceDto>) { return this.ux.addResource(r.organizationId, r.userId, id, b); }
  @Delete("projects/:id/resources/:resourceId") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) removeResource(@Req() r: Ctx, @Param("id") id: string, @Param("resourceId") resourceId: string) { return this.ux.removeResource(r.organizationId, r.userId, id, resourceId).then(() => ({ ok: true })); }
  @Get("projects/:id/brief") projectBrief(@Req() r: Ctx, @Param("id") id: string) { return this.ux.projectBrief(r.organizationId, r.userId, id); }
  @Put("projects/:id/brief") @RequirePermission(CAPABILITIES.PROJECT_MANAGE) saveProjectBrief(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ body: z.string().max(100000) }))) b: { body: string }) { return this.ux.saveProjectBrief(r.organizationId, r.userId, id, b.body); }
  @Get("projects/:id/activity-timeline") projectActivityTimeline(@Req() r: Ctx, @Param("id") id: string) { return this.ux.projectActivityTimeline(r.organizationId, r.userId, id); }
  @Get("projects/:id/list-metadata") projectListMetadata(@Req() r: Ctx, @Param("id") id: string) { return this.ux.projectListMetadata(r.organizationId, r.userId, id); }
  @Get("projects/:id/messages") messages(@Req() r: Ctx, @Param("id") id: string) { return this.ux.projectMessages(r.organizationId, r.userId, id); }
  @Post("projects/:id/messages") addMessage(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ subject: z.string().trim().min(1).max(300), body: z.string().max(20000).optional(), pinned: z.boolean().optional() }))) b: { subject: string; body?: string; pinned?: boolean }) { return this.ux.addProjectMessage(r.organizationId, r.userId, id, b); }
  @Patch("projects/:id/messages/:messageId") updateMessage(@Req() r: Ctx, @Param("id") id: string, @Param("messageId") messageId: string, @Body(new ZodPipe(z.object({ pinned: z.boolean().optional(), subject: z.string().trim().min(1).max(300).optional(), body: z.string().max(20000).optional() }))) b: { pinned?: boolean; subject?: string; body?: string }) { return this.ux.updateProjectMessage(r.organizationId, r.userId, id, messageId, b); }

  @Get("projects/:id/files") projectFiles(@Req() r: Ctx, @Param("id") id: string) { return this.ux.projectFiles(r.organizationId, r.userId, id); }
  @Get("my-work/files") myFiles(@Req() r: Ctx) { return this.ux.myFiles(r.organizationId, r.userId); }

  @Get("work-items/:id/context") context(@Req() r: Ctx, @Param("id") id: string) { return this.ux.workItemContext(r.organizationId, r.userId, id); }
  @Put("work-items/:id/collaborators/:userId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) addCollaborator(@Req() r: Ctx, @Param("id") id: string, @Param("userId") userId: string) { return this.ux.setCollaborator(r.organizationId, r.userId, id, userId, true); }
  @Delete("work-items/:id/collaborators/:userId") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) removeCollaborator(@Req() r: Ctx, @Param("id") id: string, @Param("userId") userId: string) { return this.ux.setCollaborator(r.organizationId, r.userId, id, userId, false); }
  @Put("work-items/:id/like") setLike(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ liked: z.boolean() }))) b: { liked: boolean }) { return this.ux.setLike(r.organizationId, r.userId, id, b.liked); }
  @Put("work-items/:id/public") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) setPublic(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ public: z.boolean() }))) b: { public: boolean }) { return this.ux.setPublic(r.organizationId, r.userId, id, b.public); }
  @Post("work-items/:id/follow-up") @RequirePermission(CAPABILITIES.WORKITEM_CREATE) followUp(@Req() r: Ctx, @Param("id") id: string) { return this.ux.createFollowUp(r.organizationId, r.userId, id); }
  @Post("work-items/:id/convert") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) convert(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ typeKey: z.enum(["task","milestone","approval"]) }))) b: { typeKey: string }) { return this.ux.convertType(r.organizationId, r.userId, id, b.typeKey); }
  @Post("work-items/:id/merge") @RequirePermission(CAPABILITIES.WORKITEM_EDIT) merge(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(z.object({ targetId: z.string().uuid() }))) b: { targetId: string }) { return this.ux.mergeDuplicate(r.organizationId, r.userId, id, b.targetId); }
}
