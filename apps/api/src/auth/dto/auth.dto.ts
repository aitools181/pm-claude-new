import { z } from "zod";

export const setupDto = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(256),
  displayName: z.string().min(1).max(200),
  orgName: z.string().min(1).max(200),
  orgSlug: z.string().regex(/^[a-z0-9-]+$/),
});

export const loginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
  totp: z.string().regex(/^\d{6,8}$/).optional(),
  recoveryCode: z.string().min(8).max(32).optional(),
});

export const passwordResetRequestDto = z.object({ email: z.string().email() });
export const passwordResetConfirmDto = z.object({ token: z.string().min(20), password: z.string().min(10).max(256) });
export const emailVerificationDto = z.object({ token: z.string().min(20) });
export const sessionIdDto = z.object({ sessionId: z.string().uuid() });
export const codeDto = z.object({ code: z.string().min(6).max(32) });

export type SetupInput = z.infer<typeof setupDto>;
export type LoginInput = z.infer<typeof loginDto>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestDto>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmDto>;
