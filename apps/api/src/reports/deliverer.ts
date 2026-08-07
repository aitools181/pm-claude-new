import { Injectable } from "@nestjs/common";

export const DELIVERER = Symbol("DELIVERER");

/** Delivers a generated report to recipients. Throws on failure (all-or-nothing). */
export interface Deliverer { deliver(recipients: string[], subject: string, content: string): Promise<void>; }

/** Default (sandbox/dev): "delivers" by succeeding. Production binds email/webhook. */
@Injectable()
export class LogDeliverer implements Deliverer {
  async deliver(): Promise<void> { /* no-op success */ }
}
