import { ExceptionFilter, Catch, ArgumentsHost } from "@nestjs/common";
import { Response } from "express";
import { AppError, type AppErrorCode } from "@pm/shared";

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403,
  NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503, INTERNAL: 500,
};

@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  catch(err: AppError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(STATUS[err.code] ?? 500).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
}
