import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { z } from "zod";
import { AppError, type Env } from "@pm/shared";
import { ZodPipe } from "../common/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";
import { SetupService } from "./setup.service.js";
import { TwoFactorService } from "../twofa/twofa.service.js";
import { SessionGuard } from "./guards/session.guard.js";
import {
  setupDto, loginDto, passwordResetRequestDto, passwordResetConfirmDto, emailVerificationDto,
  type SetupInput, type LoginInput, type PasswordResetRequestInput, type PasswordResetConfirmInput,
} from "./dto/auth.dto.js";
import { ENV } from "../config/config.module.js";

const COOKIE = "pm_session";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly setup: SetupService,
    private readonly twofa: TwoFactorService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private cookieOpts() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.env.NODE_ENV === "production",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 14,
    };
  }

  @Get("setup/status")
  async setupStatus() { return { completed: await this.setup.isCompleted() }; }

  @Post("setup")
  async runSetup(@Body(new ZodPipe(setupDto)) body: SetupInput) { return this.setup.run(body); }

  @Post("login")
  async login(
    @Body(new ZodPipe(loginDto)) body: LoginInput,
    @Req() req: Request, @Res({ passthrough: true }) res: Response,
  ) {
    const { user, twoFactorRequired } = await this.auth.verifyCredentials(body.email, body.password, req.ip);
    if (twoFactorRequired) {
      if (body.totp) await this.twofa.verify(user.id, body.totp);
      else if (body.recoveryCode) await this.twofa.verifyRecoveryCode(user.id, body.recoveryCode);
      else throw new AppError("UNAUTHENTICATED", "2FA code or recovery code required");
    }
    const raw = await this.sessions.create(user.id, { userAgent: req.headers["user-agent"], ip: req.ip });
    res.cookie(COOKIE, raw, this.cookieOpts());
    return { userId: user.id, displayName: user.displayName, emailVerified: Boolean(user.emailVerifiedAt) };
  }

  @Post("password-change")
  @UseGuards(SessionGuard)
  async changePassword(@Req() req: Request & { userId: string }, @Res({ passthrough: true }) res: Response, @Body(new ZodPipe(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(256) }))) body: { currentPassword: string; newPassword: string }) {
    const result = await this.auth.changePassword(req.userId, body.currentPassword, body.newPassword);
    res.clearCookie(COOKIE, this.cookieOpts());
    return result;
  }

  @Post("password-reset/request")
  requestPasswordReset(@Body(new ZodPipe(passwordResetRequestDto)) body: PasswordResetRequestInput) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Post("password-reset/confirm")
  confirmPasswordReset(@Body(new ZodPipe(passwordResetConfirmDto)) body: PasswordResetConfirmInput) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post("email-verification/request")
  @UseGuards(SessionGuard)
  requestEmailVerification(@Req() req: Request & { userId: string }) {
    return this.auth.requestEmailVerification(req.userId);
  }

  @Post("email-verification/confirm")
  confirmEmailVerification(@Body(new ZodPipe(emailVerificationDto)) body: { token: string }) {
    return this.auth.verifyEmail(body.token);
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[COOKIE];
    if (raw) await this.sessions.revoke(raw);
    res.clearCookie(COOKIE, this.cookieOpts());
    return { ok: true };
  }

  @Get("sessions")
  @UseGuards(SessionGuard)
  listSessions(@Req() req: Request & { userId: string }) {
    return this.sessions.list(req.userId, req.cookies?.[COOKIE]);
  }

  @Delete("sessions/:sessionId")
  @UseGuards(SessionGuard)
  async revokeSession(
    @Param("sessionId") sessionId: string,
    @Req() req: Request & { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[COOKIE];
    const current = raw ? await this.sessions.resolve(raw) : null;
    await this.sessions.revokeById(req.userId, sessionId);
    if (current?.id === sessionId) res.clearCookie(COOKIE, this.cookieOpts());
    return { revoked: true, current: current?.id === sessionId };
  }

  @Post("sessions/revoke-all")
  @UseGuards(SessionGuard)
  async revokeAllSessions(
    @Req() req: Request & { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const revoked = await this.sessions.revokeAll(req.userId);
    res.clearCookie(COOKIE, this.cookieOpts());
    return { revoked };
  }
}
