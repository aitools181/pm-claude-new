import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { MeetingService } from "../src/meetings/meeting.service.js";

describe("Phase 10 — meetings (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let meet: MeetingService, projects: ProjectsService, items: WorkItemsService, ws: WorkspacesService;
  let org: string, owner: string, alice: string, projectId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db); meet = new MeetingService(db, items);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "owner" }).returning(); owner = a.id;
    const [b] = await db.insert(schema.users).values({ email: "a@x.io", displayName: "alice" }).returning(); alice = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: owner }, { organizationId: org, userId: alice }]);
    const w = await ws.create(org, owner, "W"); projectId = (await projects.create(org, owner, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("orders agenda, records decisions/attendance and converts actions to linked work items", async () => {
    const series = await meet.createSeries(org, owner, { name: "Weekly", cadence: "weekly" });
    const m = await meet.createMeeting(org, { title: "Sync", seriesId: series.id });
    await meet.addAgendaItem(org, m.id, { title: "B", position: 2 });
    await meet.addAgendaItem(org, m.id, { title: "A", position: 1 });
    await meet.addDecision(org, m.id, owner, "Ship Friday");
    await meet.setAttendance(org, m.id, alice, "invited");
    await meet.setAttendance(org, m.id, alice, "attended");
    const detail = await meet.get(org, m.id);
    expect(detail.agenda.map((a) => a.title)).toEqual(["A", "B"]);
    expect(detail.attendance[0].status).toBe("attended");

    const action = await meet.addAction(org, m.id, { title: "Release notes", assigneeUserId: alice, dueDate: "2026-03-01" });
    const conv = await meet.convertAction(org, owner, action.id, { projectId });
    const [wi] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, conv.workItem.id));
    expect(wi.title).toBe("Release notes");
    expect(wi.primaryOwnerUserId).toBe(alice);
    expect(wi.dueDate).toBe("2026-03-01");
    const [actionRow] = await db.select().from(schema.meetingActions).where(eq(schema.meetingActions.id, action.id));
    expect(actionRow.status).toBe("converted"); expect(actionRow.workItemId).toBe(wi.id);
    await expect(meet.convertAction(org, owner, action.id, { projectId })).rejects.toThrow();
  });
});
