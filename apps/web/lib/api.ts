const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000") + "/api/v1";
const ORG_COOKIE = "pm_org";

export function getCurrentOrg(): string | null {
  if (typeof document === "undefined") return null;
  return document.cookie.split("; ").find((c) => c.startsWith(ORG_COOKIE + "="))?.split("=")[1] ?? null;
}
export function setCurrentOrg(id: string) { document.cookie = `${ORG_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`; }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

async function request<T>(path: string, headers: Headers, opts: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { ...opts, headers, credentials: "include" });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? "INTERNAL", e.message ?? "Request failed", e.details);
  }
  return body as T;
}

// Resolve the current org once; pages that fetch immediately no longer race the switcher.
let orgResolving: Promise<string | null> | null = null;
async function ensureOrg(): Promise<string | null> {
  const existing = getCurrentOrg();
  if (existing) return existing;
  orgResolving ??= (async () => {
    try {
      const h = new Headers({ "Content-Type": "application/json" });
      const list = await request<{ id: string }[]>("/organizations/mine", h, { method: "GET" });
      const id = list?.[0]?.id ?? null;
      if (id) setCurrentOrg(id);
      return id;
    } catch { return null; } finally { orgResolving = null; }
  })();
  return orgResolving;
}

export async function api<T>(path: string, opts: RequestInit & { org?: boolean } = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");
  if (opts.org) {
    const org = getCurrentOrg() ?? (await ensureOrg());
    if (org) headers.set("X-Organization-Id", org);
  }
  return request<T>(path, headers, opts);
}

/** Upload raw bytes through authenticated Organization-scoped gateway endpoints. */
export async function apiUpload(path: string, file: Blob): Promise<unknown> {
  const org = getCurrentOrg() ?? (await ensureOrg());
  const headers = new Headers();
  headers.set("Content-Type", file.type || "application/octet-stream");
  if (org) headers.set("X-Organization-Id", org);
  return request(path, headers, { method: "PUT", body: file });
}

/** Download protected binary content while preserving required auth and Organization headers. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const org = getCurrentOrg() ?? (await ensureOrg());
  const headers = new Headers();
  if (org) headers.set("X-Organization-Id", org);
  const res = await fetch(BASE + path, { method: "GET", headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? "INTERNAL", e.message ?? "Download failed", e.details);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
