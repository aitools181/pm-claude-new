/** Canonical application error + Result type used across modules. */
export type AppErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"        // optimistic-lock / version precondition
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE" // maintenance mode / temporary block
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: AppError): Result<never> => ({ ok: false, error });
