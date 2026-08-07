import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { NotificationsService } from "../src/collab/notifications.service.js";
import { CommentsService } from "../src/collab/comments.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let notifications: NotificationsService, comments: CommentsService;
let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;
let orgId: string, author: string, member: string, outsider: string, nonOrgUser: string;
let publicItemId: string, privateItemId: string, privateProjectId: string;

async function addUser(email: string) { const [u] = await db.insert(schema.users).values({ email, displayName: email }).returning(); return u.id; }
async function addMember(uid: string) { await db.insert(schema.organizationMemberships).values({ organizationId: orgId, userId: uid }); }

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  notifications = new NotificationsService(db, { emitToUser() {} } as any);
  comments = new CommentsService(db, notifications);
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);

  const [org] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning();
  orgId = org.id;
  await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }, { organizationId: orgId, key: "subtask", name: "Subtask" }]);

  author = await addUser("author@x.io"); await addMember(author);
  member = await addUser("member@x.io"); await addMember(member);
  outsider = await addUser("outsider@x.io"); await addMember(outsider); // org member, not project member
  nonOrgUser = await addUser("stranger@x.io"); // NOT an org member

  const workspace = await ws.create(orgId, author, "Eng");
  const pub = await projects.create(orgId, author, { workspaceId: workspace.id, name: "Public", keyPrefix: "PUB" });
  const pubItem = await items.create(orgId, author, { projectId: pub.id, title: "Public item" });
  publicItemId = pubItem.id;

  const priv = await projects.create(orgId, author, { workspaceId: workspace.id, name: "Private", keyPrefix: "PRV", privacy: "private" });
  privateProjectId = priv.id;
  const privItem = await items.create(orgId, author, { projectId: priv.id, title: "Private item" });
  privateItemId = privItem.id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 3 — mentions reach authorised users only", () => {
  it("notifies a mentioned org member but NOT a user without access", async () => {
    const c = await comments.create(orgId, author, publicItemId, { body: "hi team", mentionUserIds: [member, nonOrgUser] });

    const memberNotifs = await notifications.inbox(orgId, member);
    expect(memberNotifs.some((n) => n.type === "mention" && n.commentId === c.id)).toBe(true);

    const strangerNotifs = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientUserId, nonOrgUser));
    expect(strangerNotifs).toHaveLength(0);

    const rows = await db.select().from(schema.commentMentions).where(eq(schema.commentMentions.commentId, c.id));
    expect(rows.find((r) => r.mentionedUserId === nonOrgUser)?.notified).toBe("false");
    expect(rows.find((r) => r.mentionedUserId === member)?.notified).toBe("true");
  });
});

describe("Phase 3 — notification dedupe (reconnect safe)", () => {
  it("does not duplicate a notification with the same dedupe key", async () => {
    const key = "mention:fixed:once";
    await notifications.notify({ organizationId: orgId, recipientUserId: member, type: "mention", dedupeKey: key });
    await notifications.notify({ organizationId: orgId, recipientUserId: member, type: "mention", dedupeKey: key });
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.dedupeKey, key));
    expect(rows).toHaveLength(1);
  });
});

describe("Phase 3 — comment access control", () => {
  it("blocks a non-member from reading comments on a private project item", async () => {
    await comments.create(orgId, author, privateItemId, { body: "secret note" });
    await expect(comments.list(orgId, privateItemId, outsider)).rejects.toBeInstanceOf(AppError);
    const asAuthor = await comments.list(orgId, privateItemId, author);
    expect(asAuthor.length).toBeGreaterThan(0);
  });

  it("prevents commenting where there is no access", async () => {
    await expect(comments.create(orgId, outsider, privateItemId, { body: "sneaky" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("Phase 3 — reactions are unique per user/emoji", () => {
  it("collapses duplicate reactions", async () => {
    const c = await comments.create(orgId, author, publicItemId, { body: "react to me" });
    await comments.react(orgId, c.id, member, "👍");
    await comments.react(orgId, c.id, member, "👍");
    const rows = await db.select().from(schema.commentReactions).where(and(eq(schema.commentReactions.commentId, c.id), eq(schema.commentReactions.userId, member)));
    expect(rows).toHaveLength(1);
  });
});
