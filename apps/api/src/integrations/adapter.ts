export const ADAPTER_REGISTRY = Symbol("ADAPTER_REGISTRY");

/** An integration adapter validates connectivity for its kind. */
export interface IntegrationAdapter { kind: string; healthCheck(config: Record<string, unknown>, secret: string | null): Promise<{ ok: boolean; detail?: string }>; }
export type AdapterRegistry = Record<string, IntegrationAdapter>;

const requireSecret = (kind: string): IntegrationAdapter => ({
  kind,
  async healthCheck(_config, secret) { return secret ? { ok: true, detail: `${kind} credential present` } : { ok: false, detail: "missing credential" }; },
});

/** Built-in adapters (sandbox-safe: no external egress). Production replaces these. */
export const DEFAULT_ADAPTERS: AdapterRegistry = {
  email: requireSecret("email"),
  calendar: requireSecret("calendar"),
  github: requireSecret("github"),
  gitlab: requireSecret("gitlab"),
  generic: requireSecret("generic"),
};
