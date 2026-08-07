import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { TimerService } from "../src/time/timer.service.js";
import { TimeEntriesService } from "../src/time/time-entries.service.js";
import { TimesheetService } from "../src/time/timesheet.service.js";

let MON = new Date("2026-03-01T00:00:00Z"); while (MON.getUTCDay() !== 1) MON.setUTCDate(MON.getUTCDate() + 1);
const week = MON.toISOString().slice(0, 10);
const wed = (() => { const d = new Date(MON); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();

describe("Phase 7 — time & timesheets", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let timer: TimerService, entries: TimeEntriesService, sheets: TimesheetService;
  let org: string, u: string, ap: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    timer = new TimerService(db); entries = new TimeEntriesService(db); sheets = new TimesheetService(db, entries);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    const [b] = await db.insert(schema.users).values({ email: "ap@x.io", displayName: "ap" }).returning(); ap = b.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("timer stop commits a reconciling entry; totals match", async () => {
    const t = await timer.start(org, u, { description: "x" });
    await db.update(schema.activeTimers).set({ startedAt: new Date(Date.now() - 30 * 60000) }).where(eq(schema.activeTimers.id, t.id));
    const te = await timer.stop(org, u);
    expect(te.source).toBe("timer"); expect(te.minutes).toBeGreaterThanOrEqual(29);
    await db.update(schema.timeEntries).set({ date: wed }).where(eq(schema.timeEntries.id, te.id));
    await entries.create(org, u, { date: wed, minutes: 90 });
    const total = await entries.weekTotal(org, u, week);
    const sm = await sheets.summary(org, u, week);
    expect(sm.totalMinutes).toBe(total);
  });

  it("submit → approve → lock, and a locked week is immutable", async () => {
    expect((await sheets.submit(org, u, week)).status).toBe("submitted");
    expect((await sheets.approve(org, ap, u, week)).status).toBe("approved");
    expect((await sheets.lock(org, ap, u, week)).status).toBe("locked");
    await expect(entries.create(org, u, { date: wed, minutes: 10 })).rejects.toThrow();
    await expect(sheets.approve(org, ap, u, week)).rejects.toThrow(); // invalid transition
  });

  it("reopen unlocks the week", async () => {
    await sheets.reopen(org, ap, u, week, "fix");
    const e = await entries.create(org, u, { date: wed, minutes: 10 });
    expect(e.id).toBeTruthy();
  });
});
