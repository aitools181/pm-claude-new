/** Minimal, stable OpenAPI contract for the public API (served at /public-api/v1/openapi.json). */
export const OPENAPI_DOC = {
  openapi: "3.0.3",
  info: { title: "PM Platform Public API", version: "1.0.0", description: "Stable, versioned REST API. Authenticate with a scoped bearer token (Authorization: Bearer pmk_...). POSTs accept an Idempotency-Key header." },
  servers: [{ url: "/public-api/v1" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    schemas: {
      WorkItem: { type: "object", properties: { id: { type: "string" }, key: { type: "string" }, title: { type: "string" }, statusCategory: { type: "string" }, projectId: { type: "string" } } },
      Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/work-items": {
      get: { summary: "List work items", parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }, { name: "cursor", in: "query", schema: { type: "string" } }, { name: "projectId", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Paginated list" }, "403": { description: "Invalid/revoked/expired token or missing scope" } } },
      post: { summary: "Create work item", parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" } }], responses: { "201": { description: "Created" }, "403": { description: "Missing scope" } } },
    },
  },
} as const;
