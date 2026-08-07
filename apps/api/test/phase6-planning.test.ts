import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { DependenciesService } from "../src/dependencies/dependencies.service.js";
import { CalendarService, workingDaysBetween, addWorkingDays } from "../src/calendar/calendar.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService, deps: DependenciesService, cal: CalendarService;
let orgId: string, owner: string, outsider: string, projId: string;
let A: string, B: string, C: string;

const setDates = (id: string, startDate: string | null, dueDate: string | null) => db.update(schema.workItems).set({ startDate, dueDate }).where(eq(schema.workItems.id, id));

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
  deps = new DependenciesService(db); cal = new CalendarService(db);

  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning(); orgId = o.id;
  await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }, { organizationId: orgId, key: "subtask", name: "Subtask" }]);
  const [uo] = await db.insert(schema.users).values({ email: "owner@x.io", displayName: "owner" }).returning(); owner = uo.id;
  const [ux] = await db.insert(schema.users).values({ email: "out@x.io", displayName: "out" }).returning(); outsider = ux.id;
  await db.insert(schema.organizationMemberships).values([{ organizationId: orgId, userId: owner }, { organizationId: orgId, userId: outsider }]);

  const w = await ws.create(orgId, owner, "Eng");
  const p = await projects.create(orgId, owner, { workspaceId: w.id, name: "P", keyPrefix: "P" }); projId = p.id;
  A = (await items.create(orgId, owner, { projectId: projId, title: "A" })).id;
  B = (await items.create(orgId, owner, { projectId: projId, title: "B" })).id;
  C = (await items.create(orgId, owner, { projectId: projId, title: "C" })).id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 6 — dependencies", () => {
  it("rejects self-links and cycles (circular detection)", async () => {
    await deps.add(orgId, owner, A, B);
    await deps.add(orgId, owner, B, C);
    await expect(deps.add(orgId, owner, A, A)).rejects.toBeInstanceOf(AppError);        // self
    await expect(deps.add(orgId, owner, C, A)).rejects.toBeInstanceOf(AppError);        // C→A closes A→B→C→A
  });

  it("marks an item blocked while a predecessor is incomplete", async () => {
    expect(await deps.isBlocked(orgId, B)).toBe(true);                                   // A not done
    await db.update(schema.workItems).set({ statusCategory: "done" }).where(eq(schema.workItems.id, A));
    expect(await deps.isBlocked(orgId, B)).toBe(false);
    await db.update(schema.workItems).set({ statusCategory: "todo" }).where(eq(schema.workItems.id, A));
  });

  it("reports a dependency conflict WITHOUT cascading any dates", async () => {
    await setDates(A, "2026-02-01", "2026-02-10");
    await setDates(B, "2026-02-05", "2026-02-15");   // B starts before A is due → conflict (A→B finish_to_start)
    const conflicts = await deps.conflicts(orgId, projId);
    expect(conflicts.some((c) => c.successorId === B && c.kind === "starts_before_predecessor_due")).toBe(true);

    // No cascade: reading conflicts (or editing B) never mutated A's dates.
    const [a] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, A));
    expect(a.startDate).toBe("2026-02-01");
    expect(a.dueDate).toBe("2026-02-10");
  });
});

describe("Phase 6 — cross-project redaction (no leak)", () => {
  it("shows a redacted placeholder for a private neighbour to non-members", async () => {
    const w = await ws.create(orgId, owner, "Secret WS");
    const priv = await projects.create(orgId, owner, { workspaceId: w.id, name: "Private", keyPrefix: "PRV", privacy: "private" });
    const secret = (await items.create(orgId, owner, { projectId: priv.id, title: "TopSecretTitle" })).id;
    await deps.add(orgId, owner, A, secret); // A (public) → secret (private); owner can access both

    const asOutsider = await deps.graph(orgId, outsider, projId);
    const node = asOutsider.nodes.find((n: any) => n.id === secret);
    expect(node?.redacted).toBe(true);
    expect(node?.title).toBe("Restricted item");
    expect(JSON.stringify(asOutsider)).not.toContain("TopSecretTitle"); // details never leak

    const asOwner = await deps.graph(orgId, owner, projId);
    expect(asOwner.nodes.find((n: any) => n.id === secret)?.title).toBe("TopSecretTitle");
  });
});

describe("Phase 6 — working calendar", () => {
  it("counts working days excluding weekends and holidays; adds working days", async () => {
    let mon = new Date("2026-03-01T00:00:00Z"); while (mon.getUTCDay() !== 1) mon.setUTCDate(mon.getUTCDate() + 1);
    const d = (n: number) => { const x = new Date(mon); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const workdays = [1, 2, 3, 4, 5];

    expect(workingDaysBetween(d(0), d(6), workdays, new Set())).toBe(5);                 // Mon–Sun → 5
    expect(workingDaysBetween(d(0), d(6), workdays, new Set([d(2)]))).toBe(4);           // minus a Wed holiday
    expect(addWorkingDays(d(4), 1, workdays, new Set())).toBe(d(7));                     // Fri +1 working day → next Mon

    // DB-backed: calendar + holiday
    const c = await cal.createCalendar(orgId, owner, { name: "Std", workingDays: workdays });
    await cal.addHoliday(orgId, c.id, d(2), "Mid-week holiday");
    expect(await cal.workingDaysBetween(orgId, c.id, d(0), d(6))).toBe(4);
  });
});
