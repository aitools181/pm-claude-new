/** Optional product modules. Kept dependency-free so both plans and modules can import it. */
export const OPTIONAL_MODULES = [
  "chat", "whiteboard", "ai", "enterprise_identity", "calculations", "scenarios",
  "migration", "devops", "connected_search", "sandbox", "service_management",
  "discovery", "communications", "productivity", "ai_agents",
] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
