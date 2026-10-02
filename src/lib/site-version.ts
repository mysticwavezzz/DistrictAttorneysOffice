import packageJson from "../../package.json";
import { getSiteConfiguration } from "@/lib/site-settings";

export const VERSION_SCHEMA = /^\d+\.\d+\.\d+$/;
const LEGACY_AUTOMATIC_VERSION = "1.1.1";

export function resolveWebsiteVersion(packageVersion: string, override: string): string {
  // 1.1.1 was written by the original release migration as a fixed value,
  // before automatic package-version display was used. Treat that legacy value
  // as automatic so every subsequent Git version bump remains visible.
  if (!VERSION_SCHEMA.test(override) || override === LEGACY_AUTOMATIC_VERSION) return packageVersion;
  return override;
}

export async function getWebsiteVersion(): Promise<string> {
  const override = await getSiteConfiguration("websiteVersion", "");
  return resolveWebsiteVersion(packageJson.version, override);
}
