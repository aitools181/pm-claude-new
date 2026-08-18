import { z } from "zod";

export const createWorkspaceDto = z.object({ name: z.string().trim().min(1) });

export const createProjectDto = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1),
  keyPrefix: z.string().trim().min(1),
  privacy: z.enum(["workspace", "private"]).optional(),
});

export const createWorkItemDto = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1),
  typeKey: z.enum(["task", "subtask", "milestone", "approval"]).optional(),
  parentId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  primaryOwnerUserId: z.string().uuid().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["To Do", "In Progress", "Done"]).optional(),
  description: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createSubtaskDto = z.object({
  title: z.string().trim().min(1),
  sectionId: z.string().uuid().optional(),
  primaryOwnerUserId: z.string().uuid().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["To Do", "In Progress", "Done"]).optional(),
  description: z.string().optional(),
});

export const updateWorkItemDto = z.object({
  version: z.number().int().nonnegative(),
  patch: z.object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(["To Do", "In Progress", "Done"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    progress: z.number().int().min(0).max(100).optional(),
    primaryOwnerUserId: z.string().uuid().nullable().optional(),
    scheduleMode: z.enum(["manual", "auto"]).optional(),
    durationDays: z.number().int().positive().nullable().optional(),
    estimateMinutes: z.number().int().nonnegative().nullable().optional(),
    storyPoints: z.number().int().nonnegative().nullable().optional(),
  }),
});
