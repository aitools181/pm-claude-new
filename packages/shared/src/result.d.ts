/** Canonical application error + Result type used across modules. */
export type AppErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL";
export declare class AppError extends Error {
    readonly code: AppErrorCode;
    readonly details?: unknown | undefined;
    constructor(code: AppErrorCode, message: string, details?: unknown | undefined);
}
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: AppError;
};
export declare const ok: <T>(value: T) => Result<T>;
export declare const err: (error: AppError) => Result<never>;
