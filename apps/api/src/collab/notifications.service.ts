import { Injectable, Inject, Optional, Logger } from "@nestjs/common";
import { and, eq, desc, isNull, isNotNull, sql, lte, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { MailService } from "../mail/mail.service.js";

const FLUSH_EVERY_MS = 10 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
    @Optional() private readonly mail?: MailService,
  ) {
    // F23: in-process flusher for quiet-hours deferrals and digests.
    // Self-contained by design — no external worker required.
    const timer = setInterval(() => { this.flushQueued().catch((e) => this.log.warn(`digest flush failed: ${e}`)); }, FLUSH_EVERY_MS);
    timer.unref?.();
  }

  async notify(input: {
    organizationId: string; recipientUserId: string; type: string;
    workItemId?: string; commentId?: string; actorUserId?: string; data?: string; dedupeKey: string;
  }) {
    const rows = await this.db.insert(schema.notifications).values(input)
      .onConflictDoNothing({ target: schema.notifications.dedupeKey }).returning();
    if (rows[0]) {
      this.realtime.emitToUser(input.recipientUserId, "notification", rows[0]);
      this.deliverEmail(input).catch((e) => this.log.warn(`email delivery failed: ${e}`));
    }
  }

  /** F23: honour the email channel preference, then route through quiet hours / digest. */
  // Types that must always break through quiet hours / vacation mode.
  private readonly OVERRIDE_TYPES = new Set(["security_alert", "on_call_page", "suspicious_login"]);

  private async deliverEmail(input: { organizationId: string; recipientUserId: string; type: string; data?: string }) {
    if (!this.mail) return;
    const [pref] = await this.db.select({ enabled: schema.notificationPreferences.enabled }).from(schema.notificationPreferences)
      .where(and(
        eq(schema.notificationPreferences.userId, input.recipientUserId),
        eq(schema.notificationPreferences.type, input.type),
        eq(schema.notificationPreferences.channel, "email"),
      )).limit(1);
    if (!pref || pref.enabled !== "true") return;

    const subject = `[PM] ${input.type.replace(/_/g, " ")}`;
    const body = input.data || `You have a new ${input.type.replace(/_/g, " ")} notification. Open your inbox to review it.`;
    const isOverride = this.OVERRIDE_TYPES.has(input.type);

    const [settings] = await this.db.select().from(schema.notificationDeliverySettings)
      .where(and(eq(schema.notificationDeliverySettings.organizationId, input.organizationId), eq(schema.notificationDeliverySettings.userId, input.recipientUserId))).limit(1);
    const hour = await this.orgLocalHour(input.organizationId);
    const inQuiet = !isOverride && settings?.quietFrom != null && settings?.quietTo != null && this.hourInWindow(hour, settings.quietFrom, settings.quietTo);
    const inVacation = !isOverride && this.inVacationWindow(settings?.vacationFrom, settings?.vacationTo);
    const wantsDigest = !isOverride && (settings?.digestFrequency === "daily" || settings?.digestFrequency === "weekly");

    if (inQuiet || inVacation || wantsDigest) {
      await this.db.insert(schema.notificationDigestQueue).values({
        organizationId: input.organizationId, userId: input.recipientUserId,
        subject, body, queuedReason: inVacation ? "quiet_hours" : wantsDigest ? "digest" : "quiet_hours",
      });
      return;
    }
    const [user] = await this.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, input.recipientUserId)).limit(1);
    if (user) await this.mail.send(user.email, subject, body);
  }

  /** NOTIF.D2 — vacation mode: today falls within [vacationFrom, vacationTo] (org-local date). */
  private inVacationWindow(from?: string | null, to?: string | null) {
    if (!from || !to) return false;
    const today = new Date().toISOString().slice(0, 10);
    return today >= from && today <= to;
  }

  private hourInWindow(hour: number, from: number, to: number) {
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to; // 22→7 wraps midnight
  }

  private async orgLocalHour(organizationId: string) {
    const [s] = await this.db.select({ timezone: schema.organizationSettings.timezone }).from(schema.organizationSettings)
      .where(eq(schema.organizationSettings.organizationId, organizationId)).limit(1);
    try {
      return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: s?.timezone || "UTC" }).format(new Date()));
    } catch { return new Date().getUTCHours(); }
  }

  /** Sends deferred quiet-hours mail once the window ends, and digests at the chosen hour. */
  async flushQueued() {
    if (!this.mail) return;
    const pending = await this.db.select().from(schema.notificationDigestQueue)
      .where(isNull(schema.notificationDigestQueue.flushedAt)).limit(2000);
    if (!pending.length) return;

    const byUser = new Map<string, typeof pending>();
    for (const row of pending) {
      const key = `${row.organizationId}:${row.userId}`;
      byUser.set(key, [...(byUser.get(key) ?? []), row]);
    }
    for (const [key, rows] of byUser) {
      const [organizationId, userId] = key.split(":");
      const [settings] = await this.db.select().from(schema.notificationDeliverySettings)
        .where(and(eq(schema.notificationDeliverySettings.organizationId, organizationId), eq(schema.notificationDeliverySettings.userId, userId))).limit(1);
      const hour = await this.orgLocalHour(organizationId);
      const inQuiet = settings?.quietFrom != null && settings?.quietTo != null && this.hourInWindow(hour, settings.quietFrom, settings.quietTo);

      const quietRows = rows.filter((r) => r.queuedReason === "quiet_hours");
      const digestRows = rows.filter((r) => r.queuedReason === "digest");
      const [user] = await this.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!user) continue;

      // Quiet-hours deferrals go out individually as soon as the window ends.
      if (quietRows.length && !inQuiet) {
        for (const r of quietRows) await this.mail.send(user.email, r.subject, r.body);
        await this.db.update(schema.notificationDigestQueue).set({ flushedAt: new Date() })
          .where(inArray(schema.notificationDigestQueue.id, quietRows.map((r) => r.id)));
      }

      // Digests go out as one combined email at the chosen hour (weekly = Monday).
      if (digestRows.length && settings && (settings.digestFrequency === "daily" || settings.digestFrequency === "weekly")) {
        const isWeeklyDay = settings.digestFrequency !== "weekly" || new Date().getUTCDay() === 1;
        if (hour === settings.digestHour && isWeeklyDay && !inQuiet) {
          const bodyLines = digestRows.map((r) => `• ${r.subject.replace(/^\[PM\]\s*/, "")} — ${r.body}`);
          await this.mail.send(user.email, `[PM] Your ${settings.digestFrequency} digest (${digestRows.length} updates)`, bodyLines.join("\n"));
          await this.db.update(schema.notificationDigestQueue).set({ flushedAt: new Date() })
            .where(inArray(schema.notificationDigestQueue.id, digestRows.map((r) => r.id)));
        }
      }
    }
  }

  async deliverySettings(organizationId: string, userId: string) {
    const [row] = await this.db.select().from(schema.notificationDeliverySettings)
      .where(and(eq(schema.notificationDeliverySettings.organizationId, organizationId), eq(schema.notificationDeliverySettings.userId, userId))).limit(1);
    return row ?? { organizationId, userId, digestFrequency: "off", digestHour: 9, quietFrom: null, quietTo: null, vacationFrom: null, vacationTo: null };
  }

  async setDeliverySettings(organizationId: string, userId: string, input: { digestFrequency: "off" | "daily" | "weekly"; digestHour: number; quietFrom: number | null; quietTo: number | null; vacationFrom?: string | null; vacationTo?: string | null }) {
    if ((input.quietFrom == null) !== (input.quietTo == null)) throw new AppError("VALIDATION", "Quiet hours need both a start and an end");
    if ((input.vacationFrom == null) !== (input.vacationTo == null)) throw new AppError("VALIDATION", "Vacation mode needs both a start and an end date");
    const values = { organizationId, userId, ...input, updatedAt: new Date() };
    const [row] = await this.db.insert(schema.notificationDeliverySettings).values(values)
      .onConflictDoUpdate({ target: [schema.notificationDeliverySettings.organizationId, schema.notificationDeliverySettings.userId], set: { ...input, updatedAt: new Date() } })
      .returning();
    return row;
  }

  async inbox(organizationId: string, userId: string, opts: { unreadOnly?: boolean; tab?: string; sort?: "newest" | "relevance" } = {}) {
    const conds = [eq(schema.notifications.organizationId, organizationId), eq(schema.notifications.recipientUserId, userId)];
    if (opts.unreadOnly) conds.push(isNull(schema.notifications.readAt));
    if (opts.tab === "bookmarks") conds.push(isNotNull(schema.notifications.bookmarkedAt));
    else if (opts.tab === "archive") conds.push(isNotNull(schema.notifications.archivedAt));
    else {
      conds.push(isNull(schema.notifications.archivedAt));
      if (opts.tab === "mentioned") conds.push(eq(schema.notifications.type, "mention"));
    }
    const rows = await this.db.select().from(schema.notifications).where(and(...conds)).orderBy(desc(schema.notifications.createdAt)).limit(250);
    if (opts.sort !== "relevance") return rows;
    const weight = (row: typeof rows[number]) => {
      const unread = row.readAt ? 0 : 100;
      const bookmarked = row.bookmarkedAt ? 25 : 0;
      const type = row.type === "mention" ? 40 : row.type === "assigned" ? 32 : row.type === "comment" ? 18 : 10;
      const ageHours = Math.max(0, (Date.now() - new Date(row.createdAt).getTime()) / 3_600_000);
      return unread + bookmarked + type + Math.max(0, 24 - ageHours / 6);
    };
    return rows.slice().sort((a, b) => weight(b) - weight(a) || +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  async markRead(organizationId: string, userId: string, id: string) {
    await this.db.update(schema.notifications).set({ readAt: new Date() })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId)));
  }
  async markAllRead(organizationId: string, userId: string) {
    await this.db.update(schema.notifications).set({ readAt: new Date() })
      .where(and(eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId), isNull(schema.notifications.readAt), isNull(schema.notifications.archivedAt)));
  }
  async setBookmark(organizationId: string, userId: string, id: string, on: boolean) {
    const [row] = await this.db.update(schema.notifications).set({ bookmarkedAt: on ? new Date() : null })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Inbox item not found");
    return row;
  }
  async setArchive(organizationId: string, userId: string, id: string, on: boolean) {
    const [row] = await this.db.update(schema.notifications).set({ archivedAt: on ? new Date() : null, readAt: on ? new Date() : undefined })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Inbox item not found");
    return row;
  }
  async archiveAll(organizationId: string, userId: string) {
    const rows = await this.db.update(schema.notifications).set({ archivedAt: new Date(), readAt: new Date() })
      .where(and(eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId), isNull(schema.notifications.archivedAt))).returning({ id: schema.notifications.id });
    return { archived: rows.length };
  }

  async unreadCount(organizationId: string, userId: string): Promise<number> {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.notifications)
      .where(and(eq(schema.notifications.organizationId, organizationId), eq(schema.notifications.recipientUserId, userId), isNull(schema.notifications.readAt), isNull(schema.notifications.archivedAt)));
    return count;
  }
}
