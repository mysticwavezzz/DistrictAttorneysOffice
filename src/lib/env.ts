import { z } from "zod";

/**
 * Centralized, validated environment access. Every other module reads
 * config through this file instead of `process.env` directly, so a
 * missing/malformed value fails fast at boot instead of surfacing as a
 * confusing runtime error deep in an OAuth callback.
 */

// An unset optional env var and one explicitly set to "" (common when a
// deployment platform's env editor won't let you omit a key) should both
// mean "not configured" — without this, `z.string().url().optional()`
// rejects "" as an invalid URL instead of treating it as absent.
const optionalUrl = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().url().optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Auth.js
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters (generate with `openssl rand -base64 32`)"),
  AUTH_URL: optionalUrl,

  // Roblox OAuth2 (https://create.roblox.com/dashboard/credentials)
  ROBLOX_CLIENT_ID: z.string().min(1, "ROBLOX_CLIENT_ID is required"),
  ROBLOX_CLIENT_SECRET: z.string().min(1, "ROBLOX_CLIENT_SECRET is required"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Google Form (criminal tips submission)
  GOOGLE_FORM_ACTION_URL: optionalUrl,
  GOOGLE_FORM_ENTRY_NAME: z.string().optional(),
  GOOGLE_FORM_ENTRY_CONTACT: z.string().optional(),
  GOOGLE_FORM_ENTRY_LOCATION: z.string().optional(),
  GOOGLE_FORM_ENTRY_DETAILS: z.string().optional(),

  // Site
  NEXT_PUBLIC_SITE_NAME: z.string().default("District Attorney's Office"),
  NEXT_PUBLIC_SITE_URL: optionalUrl,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function loadEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration. Fix the following and restart:\n${issues}\n\nSee .env.example for the full list of required variables.`
    );
  }

  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
