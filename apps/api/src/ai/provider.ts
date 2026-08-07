import { Injectable } from "@nestjs/common";

export const AI_PROVIDER = Symbol("AI_PROVIDER");

export type Citation = { kind: string; id: string; key?: string };
export interface AiProvider {
  name: string;
  healthy(): boolean;
  /** Draft a concise task title from text + retrieved context. Throws when the provider is down. */
  draftTitle(text: string, context: Citation[]): Promise<{ title: string; tokens: number }>;
}

/** Sandbox-safe deterministic provider (no external egress). BYOK/local bind real clients. */
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
}
