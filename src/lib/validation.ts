import { z } from "zod";

/** Shared input rules for the account API (server) and forms (client). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
export const nameSchema = z.string().trim().max(120);
export const localeSchema = z.enum(["az", "ru", "en"]);

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema, name: nameSchema.default(""), locale: localeSchema.default("az") });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(PASSWORD_MAX) });
export const forgotSchema = z.object({ email: emailSchema, locale: localeSchema.default("az") });
export const resetSchema = z.object({ token: z.string().min(20).max(100), password: passwordSchema });
export const profileSchema = z.object({ name: nameSchema, locale: localeSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: passwordSchema });
