import packageJson from "../../package.json";
import { getSiteConfiguration } from "@/lib/site-settings";

export const VERSION_SCHEMA = /^\d+\.\d+\.\d+$/;

export async function getWebsiteVersion(): Promise<string> {
  const override = await getSiteConfiguration("websiteVersion", "");
  return VERSION_SCHEMA.test(override) ? override : packageJson.version;
}
