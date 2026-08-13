import { Injectable } from "@nestjs/common";
import type { Env } from "@pm/shared";

export const AI_PROVIDER = Symbol("AI_PROVIDER");

export type Citation = { kind: string; id: string; key?: string };
export interface AiProvider {
  name: string;
  healthy(): boolean;
  /** Draft a concise task title from text + retrieved context. Throws when unavailable. */
  draftTitle(text: string, context: Citation[]): Promise<{ title: string; tokens: number }>;
  summarize(prompt: string): Promise<{ text: string; tokens: number }>;
}

/** Deterministic development/test provider. Production validation rejects it. */
@Injectable()
export class MockAiProvider implements AiProvider {
  name = "mock";
  private up = true;
  setHealthy(v: boolean) { this.up = v; }
  healthy() { return this.up; }
  async draftTitle(text: string, _context: Citation[]) {
    if (!this.up) throw new Error("provider_unavailable");
    const firstLine = text.split(/[.\n]/)[0].trim();
    const title = (firstLine || text).slice(0, 80);
    return { title, tokens: Math.max(1, Math.ceil(text.length / 4)) };
  }
  async summarize(prompt: string) {
    if (!this.up) throw new Error("provider_unavailable");
    const lines = prompt.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
    return { text: lines.join(" ").slice(0, 1200), tokens: Math.max(1, Math.ceil(prompt.length / 4)) };
  }
}

export class DisabledAiProvider implements AiProvider {
  name = "disabled";
  healthy() { return false; }
  async draftTitle(): Promise<{ title: string; tokens: number }> { throw new Error("provider_disabled"); }
  async summarize(): Promise<{ text: string; tokens: number }> { throw new Error("provider_disabled"); }
}

/**
 * Provider for servers exposing the OpenAI-compatible /chat/completions shape.
 * Keeping it HTTP-only avoids coupling the platform to a vendor SDK and works
 * with hosted or local compatible gateways configured by the operator.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  name = "openai_compatible";
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly model: string) {}
  healthy() { return Boolean(this.baseUrl && this.apiKey && this.model); }

  async draftTitle(text: string, context: Citation[]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 48,
          messages: [
            { role: "system", content: "Return only a concise project-task title, maximum 80 characters. Do not add quotes or commentary." },
            { role: "user", content: `${text}\n\nContext references: ${context.map((c) => c.key ?? c.id).join(", ") || "none"}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`provider_http_${res.status}`);
      const body = await res.json() as any;
      const content = String(body?.choices?.[0]?.message?.content ?? "").trim().replace(/^['"]|['"]$/g, "");
      if (!content) throw new Error("provider_empty_response");
      const tokens = Number(body?.usage?.total_tokens ?? Math.max(1, Math.ceil(text.length / 4)));
      return { title: content.slice(0, 80), tokens: Number.isFinite(tokens) ? tokens : 0 };
    } finally { clearTimeout(timer); }
  }

  async summarize(prompt: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model, temperature: 0.2, max_tokens: 500,
          messages: [
            { role: "system", content: "Summarize project-management information clearly and concisely. State risks and sources only when supplied. Do not invent facts." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`provider_http_${res.status}`);
      const body = await res.json() as any;
      const text = String(body?.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("provider_empty_response");
      const tokens = Number(body?.usage?.total_tokens ?? Math.max(1, Math.ceil(prompt.length / 4)));
      return { text, tokens: Number.isFinite(tokens) ? tokens : 0 };
    } finally { clearTimeout(timer); }
  }
}

export function createAiProvider(env: Env): AiProvider {
  if (env.AI_PROVIDER === "disabled") return new DisabledAiProvider();
  if (env.AI_PROVIDER === "openai_compatible") return new OpenAiCompatibleProvider(env.AI_BASE_URL!, env.AI_API_KEY!, env.AI_MODEL!);
  return new MockAiProvider();
}
