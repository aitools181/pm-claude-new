export const ADAPTER_REGISTRY = Symbol("ADAPTER_REGISTRY");

/** An integration adapter validates real connectivity for its kind. */
export interface IntegrationAdapter {
  kind: string;
  healthCheck(config: Record<string, unknown>, secret: string | null): Promise<{ ok: boolean; detail?: string }>;
}
export type AdapterRegistry = Record<string, IntegrationAdapter>;

async function probe(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal, redirect: "error" });
    return res.ok
      ? { ok: true, detail: `HTTP ${res.status}` }
      : { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "connection failed" };
  } finally { clearTimeout(timer); }
}

const configuredHttp = (kind: string): IntegrationAdapter => ({
  kind,
  async healthCheck(config, secret) {
    if (!secret) return { ok: false, detail: "missing credential" };
    const url = typeof config.healthUrl === "string" ? config.healthUrl : "";
    if (!/^https?:\/\//i.test(url)) return { ok: false, detail: `${kind} requires config.healthUrl for a live connectivity check` };
    const authHeader = typeof config.authHeader === "string" ? config.authHeader : "authorization";
    const authScheme = typeof config.authScheme === "string" ? config.authScheme : "Bearer";
    return probe(url, { [authHeader]: authScheme ? `${authScheme} ${secret}` : secret, "user-agent": "pm-platform-integration-health" });
  },
});

const github: IntegrationAdapter = {
  kind: "github",
  async healthCheck(config, secret) {
    if (!secret) return { ok: false, detail: "missing credential" };
    const base = typeof config.apiBaseUrl === "string" ? config.apiBaseUrl.replace(/\/$/, "") : "https://api.github.com";
    return probe(`${base}/user`, {
      authorization: `Bearer ${secret}`,
      accept: "application/vnd.github+json",
      "user-agent": "pm-platform-integration-health",
    });
  },
};

const gitlab: IntegrationAdapter = {
  kind: "gitlab",
  async healthCheck(config, secret) {
    if (!secret) return { ok: false, detail: "missing credential" };
    const base = typeof config.apiBaseUrl === "string" ? config.apiBaseUrl.replace(/\/$/, "") : "https://gitlab.com/api/v4";
    return probe(`${base}/user`, { "private-token": secret, "user-agent": "pm-platform-integration-health" });
  },
};

/**
 * Built-in adapters never mark an integration healthy from secret presence
 * alone. GitHub/GitLab have concrete live probes; provider-specific email,
 * calendar and generic adapters require an explicit healthUrl.
 */
export const DEFAULT_ADAPTERS: AdapterRegistry = {
  email: configuredHttp("email"),
  calendar: configuredHttp("calendar"),
  github,
  gitlab,
  generic: configuredHttp("generic"),
};
