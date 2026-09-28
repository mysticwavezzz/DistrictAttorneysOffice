import { z } from "zod";

const optionalUrl = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().url().optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters (generate with `openssl rand -base64 32`)"),
  AUTH_URL: optionalUrl,

  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_CLIENT_SECRET: z.string().min(1, "DISCORD_CLIENT_SECRET is required"),
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  GOOGLE_FORM_ACTION_URL: optionalUrl,
  GOOGLE_FORM_ENTRY_NAME: z.string().optional(),
  GOOGLE_FORM_ENTRY_CONTACT: z.string().optional(),
  GOOGLE_FORM_ENTRY_LOCATION: z.string().optional(),
  GOOGLE_FORM_ENTRY_DETAILS: z.string().optional(),

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
