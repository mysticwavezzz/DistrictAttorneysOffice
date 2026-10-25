import { getSiteConfiguration } from "@/lib/site-settings";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export const ALLOWED_GROQ_MODELS = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", tier: "Free-plan eligible" },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", tier: "Free-plan eligible · preview" },
] as const;

export type AllowedGroqModel = (typeof ALLOWED_GROQ_MODELS)[number]["id"];

export function isAllowedGroqModel(value: unknown): value is AllowedGroqModel {
  return typeof value === "string" && ALLOWED_GROQ_MODELS.some((model) => model.id === value);
}

export async function getConfiguredGroqModel(): Promise<AllowedGroqModel> {
  const configured = await getSiteConfiguration<string>("aiGroqModel", "");
  if (isAllowedGroqModel(configured)) return configured;
  const environmentDefault = process.env.GROQ_MODEL;
  return isAllowedGroqModel(environmentDefault) ? environmentDefault : DEFAULT_GROQ_MODEL;
}
