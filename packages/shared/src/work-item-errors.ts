/**
 * ભાગ 9.16 — Work Item validation error-code catalogue.
 *
 * Every work-item validation failure carries one of these STABLE codes in
 * `AppError.details.code`. Clients and automations branch on the code, never
 * on the human-readable message; messages may be reworded freely but the codes
 * below are a compatibility contract and must never be renamed. The
 * verify-production-readiness gate cross-checks that thrown codes stay inside
 * this catalogue.
 */
export const WORK_ITEM_ERRORS = {
  WORK_ITEM_TITLE_REQUIRED: "A work item needs a non-empty title",
  WORK_ITEM_PROJECT_REQUIRED: "An owning project is required and must exist",
  WORK_ITEM_PROJECT_READ_ONLY: "The owning project is archived or read-only",
  WORK_ITEM_TYPE_NOT_ALLOWED: "The work item type is unknown or not allowed here",
  WORK_ITEM_STATUS_NOT_ALLOWED: "The status is not part of the bound workflow",
  WORK_ITEM_ASSIGNEE_NOT_ALLOWED: "The assignee is not an active member of this organization",
  WORK_ITEM_PARENT_REQUIRED: "This type must be created under a parent item",
  WORK_ITEM_PARENT_INACCESSIBLE: "The parent work item does not exist or is not accessible",
  WORK_ITEM_PARENT_NOT_ALLOWED: "The parent type may not contain this child type",
  WORK_ITEM_CROSS_PROJECT_PARENT_PROHIBITED: "A subtask must stay in its parent's owning project",
  WORK_ITEM_HIERARCHY_CYCLE: "This parent assignment would create a hierarchy cycle",
  WORK_ITEM_MAX_DEPTH_EXCEEDED: "The hierarchy would exceed the maximum nesting depth",
  WORK_ITEM_OPEN_CHILDREN: "The item still has open children",
  WORK_ITEM_MOVE_MAPPING_REQUIRED: "Moving requires a status/field mapping",
  WORK_ITEM_VERSION_CONFLICT: "The item changed since it was loaded — reload and retry",
  WORK_ITEM_IDEMPOTENCY_RETRY: "Idempotency reservation changed; retry the request",
  WORK_ITEM_IDEMPOTENCY_CONFLICT: "Idempotency key was already used for a different request",
  WORK_ITEM_IDEMPOTENCY_IN_PROGRESS: "The original request is still being processed",
} as const;

export type WorkItemErrorCode = keyof typeof WORK_ITEM_ERRORS;
