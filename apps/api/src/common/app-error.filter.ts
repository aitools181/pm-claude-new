import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from "@nestjs/common";
import { Response } from "express";
import { AppError, type AppErrorCode } from "@pm/shared";

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403,
  NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503, INTERNAL: 500,
};

/**
 * Every error leaves the API in one shape: { error: { code, message, details } }.
 *
 * This used to be `@Catch(AppError)`, so anything else - a driver error, a
 * missing native binding, a bug - fell through to Nest's default filter and
 * came back as `{ statusCode: 500, message: "Internal server error" }`. The web
 * client reads `body.error.message`, found nothing, and showed the useless
 * "Request failed". Catching everything here means the client always has
 * something to display, and the real stack is logged server-side.
 */
@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("AppErrorFilter");

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (err instanceof AppError) {
      res.status(STATUS[err.code] ?? 500).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }

    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse();
      const message = typeof body === "string" ? body
        : (body as { message?: string | string[] })?.message ?? err.message;
      res.status(status).json({
        error: { code: status === 404 ? "NOT_FOUND" : "INTERNAL", message: Array.isArray(message) ? message.join(", ") : message },
      });
      return;
    }

    // Unexpected. Log the real cause; return a short, non-leaking summary so the
    // client can show something more actionable than "Request failed".
    this.logger.error(err instanceof Error ? err.stack ?? err.message : String(err));
    const summary = err instanceof Error ? `${err.name}: ${err.message}` : "Unexpected server error";
    res.status(500).json({ error: { code: "INTERNAL", message: summary } });
  }
}
