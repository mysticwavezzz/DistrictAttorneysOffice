import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getSiteConfiguration } from "@/lib/site-settings";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
import { capabilityMarkersForTiers, hasAnyCapability, hasCapability, resolveTiersFromRoleMappings } from "@/lib/permissions/resolve";
import { findRouteRule } from "@/config/route-permissions";
import { DISCORD_TIER_ROLE_MAPPINGS } from "@/config/discord-role-mappings";
import { fetchDiscordGuildMember, fetchDiscordGuildRoles } from "@/lib/discord/guild";
import { CRIME_TIP_FORM } from "@/config/crime-tip-form";
import type { PermissionTier } from "@/lib/permissions/tiers";

function Result({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  return <tr><th>{label}</th><td><span className={`pill ${ok === null ? "pill-muted" : ok ? "pill-green" : "pill-red"}`}>{ok === null ? "Unknown" : ok ? "Healthy" : "Issue"}</span> {detail}</td></tr>;
}

export default async function AdminStatusPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");
  const mappings = await getSiteConfiguration("discordRoleMappings", DISCORD_TIER_ROLE_MAPPINGS);
  const capabilities = await getSiteConfiguration<Record<string, string[]>>("tierCapabilities", {});
  const form = await getSiteConfiguration("crimeTipForm", CRIME_TIP_FORM);
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  let discordOk: boolean | null = null;
  let roleNames = new Map<string, string>();
  let memberRoleIds: string[] = [];
  let discordDetail = "Unable to check Discord";
  try {
    const [roles, member] = await Promise.all([
      fetchDiscordGuildRoles(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID),
      fetchDiscordGuildMember(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID, session.user.discordUserId),
    ]);
    roleNames = new Map(roles.map((role) => [role.id, role.name]));
    memberRoleIds = member?.roles ?? [];
    discordOk = Boolean(member);
    discordDetail = member ? `Connected; ${member.roles.length} roles detected for your account.` : "Your account is not a member of the configured Discord server.";
  } catch (error) { discordDetail = error instanceof Error ? error.message : "Discord API check failed."; }
  let googleOk: boolean | null = null;
  let googleDetail = "Not checked";
  try {
    const response = await fetch(form.viewUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    googleOk = response.ok;
    googleDetail = response.ok ? "Google Form is reachable (no response was submitted)." : `Google Form returned HTTP ${response.status}.`;
  } catch { googleOk = false; googleDetail = "Google Form could not be reached."; }
  const ids = memberRoleIds;
  const matched = mappings.filter((mapping) => mapping.roleIds.some((id) => ids.includes(id)));
  const baseTiers = resolveTiersFromRoleMappings(ids, mappings);
  const resolvedTiers = [...baseTiers, ...capabilityMarkersForTiers(baseTiers, capabilities)] as PermissionTier[];
  const routes = ["/dashboard", "/dashboard/cases", "/dashboard/roster", "/dashboard/affidavits", "/98981"];

  return <main className="paper" style={{ maxWidth: 1000, margin: "24px auto" }}>
    <p><Link href="/98981">← Site Settings</Link></p><h1>Integration Health &amp; Access Diagnostics</h1>
    <p className="note-inline">Checks run when this page loads. Secrets and raw tokens are never displayed.</p>
    <h2>Service health</h2><div className="tablewrap"><table className="stat"><tbody>
      <Result label="Database" ok={dbOk} detail={dbOk ? "SQLite query succeeded." : "Database query failed."}/>
      <Result label="Discord role sync" ok={discordOk} detail={discordDetail}/>
      <Result label="Google Forms delivery" ok={googleOk} detail={googleDetail}/>
      <Result label="Railway deployment" ok={Boolean(process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_GIT_COMMIT_SHA)} detail={process.env.RAILWAY_DEPLOYMENT_ID ? `Deployment ${process.env.RAILWAY_DEPLOYMENT_ID}; commit ${process.env.RAILWAY_GIT_COMMIT_SHA ?? "not provided"}.` : "Railway deployment metadata is unavailable in this runtime."}/>
    </tbody></table></div>
    <h2>Discord roles detected for {session.user.displayName}</h2>
    {ids.length ? <ul>{ids.map((id)=><li key={id}>{roleNames.get(id) ?? "Unknown/deleted role"} <code>{id}</code></li>)}</ul> : <p>No roles detected.</p>}
    <h3>Permission tiers granted</h3>
    {matched.length ? <ul>{matched.map((mapping)=><li key={mapping.tier}>{mapping.tier} from {mapping.roleIds.filter((id)=>ids.includes(id)).map((id)=>roleNames.get(id) ?? id).join(", ")}</li>)}</ul> : <p>No configured tier role matched.</p>}
    <h3>Page access evaluation</h3><div className="tablewrap"><table className="stat"><thead><tr><th>Page</th><th>Result</th><th>Reason</th></tr></thead><tbody>{routes.map((path)=>{const rule=findRouteRule(path);const allowed=rule ? hasAnyCapability(resolvedTiers, rule.capabilities) : true; return <tr key={path}><td><code>{path}</code></td><td><span className={`pill ${allowed ? "pill-green" : "pill-red"}`}>{allowed ? "Allowed" : "Denied"}</span></td><td>{rule ? `${rule.prefix} requires any of: ${rule.capabilities.join(", ")}. Your grants: ${rule.capabilities.filter((cap)=>hasCapability(resolvedTiers, cap)).join(", ") || "none"}.` : "No permission rule applies."}</td></tr>})}</tbody></table></div>
  </main>;
}
