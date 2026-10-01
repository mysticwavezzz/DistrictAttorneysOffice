import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteConfiguration } from "@/lib/site-settings";
import { CAPABILITIES } from "@/lib/permissions/capabilities";
import { capabilityMarkersForTiers, hasAnyCapability, hasCapability, resolveTiersFromRobloxRoles } from "@/lib/permissions/resolve";
import { findRouteRule } from "@/config/route-permissions";
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";
import { fetchRobloxGroupRoles } from "@/lib/roblox/groups";
import type { RobloxGroupRole } from "@/lib/roblox/types";
import { CRIME_TIP_FORM } from "@/config/crime-tip-form";
import type { PermissionTier } from "@/lib/permissions/tiers";

function Result({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  return <tr><th>{label}</th><td><span className={`pill ${ok === null ? "pill-muted" : ok ? "pill-green" : "pill-red"}`}>{ok === null ? "Unknown" : ok ? "Healthy" : "Issue"}</span> {detail}</td></tr>;
}

export default async function AdminStatusPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");
  const [robloxMappings, capabilities, form] = await Promise.all([
    getSiteConfiguration("robloxTierRoleMappings", ROBLOX_TIER_ROLE_MAPPINGS).then(normalizeRobloxTierRoleMappings),
    getSiteConfiguration<Record<string, string[]>>("tierCapabilities", {}),
    getSiteConfiguration("crimeTipForm", CRIME_TIP_FORM),
  ]);
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  let robloxRoles: RobloxGroupRole[] = [];
  let robloxOk: boolean | null = null;
  let robloxDetail = "Roblox account is not available in this session.";
  if (session.user.robloxUserId) try {
    robloxRoles = await fetchRobloxGroupRoles(session.user.robloxUserId);
    robloxOk = true;
    robloxDetail = `${robloxRoles.length} community roles detected across Roblox groups.`;
  } catch (error) { robloxOk = false; robloxDetail = error instanceof Error ? error.message : "Roblox Groups API check failed."; }
  let googleOk: boolean | null = null;
  let googleDetail = "Not checked";
  try {
    const response = await fetch(form.viewUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    googleOk = response.ok;
    googleDetail = response.ok ? "Google Form is reachable (no response was submitted)." : `Google Form returned HTTP ${response.status}.`;
  } catch { googleOk = false; googleDetail = "Google Form could not be reached."; }
  const matchedDetails = robloxMappings.filter((mapping) => robloxRoles.some((role) => role.groupId === mapping.groupId && mapping.roleIds.includes(role.roleId))).map((mapping) => ({
    tier: mapping.tier,
    roles: robloxRoles.filter((role) => role.groupId === mapping.groupId && mapping.roleIds.includes(role.roleId)).map((role) => `${role.roleName} (${role.roleId})`),
  }));
  const baseTiers = resolveTiersFromRobloxRoles(robloxRoles, robloxMappings);
  const resolvedTiers = [...baseTiers, ...capabilityMarkersForTiers(baseTiers, capabilities)] as PermissionTier[];
  const routes = ["/dashboard", "/dashboard/cases", "/dashboard/filings", "/dashboard/roster", "/98981"];

  return <main className="paper" style={{ maxWidth: 1000, margin: "24px auto" }}>
    <p><Link href="/98981">← Site Settings</Link></p><h1>Integration Health &amp; Access Diagnostics</h1>
    <p className="note-inline">Roblox group roles are the sole source of website permissions. Discord identity linking and notifications do not grant access.</p>
    <h2>Service health</h2><div className="tablewrap"><table className="stat"><tbody>
      <Result label="Staff sign-in" ok={Boolean(process.env.ROBLOX_CLIENT_ID && process.env.ROBLOX_CLIENT_SECRET)} detail="Roblox OAuth only."/>
      <Result label="Database" ok={dbOk} detail={dbOk ? "SQLite query succeeded." : "Database query failed."}/>
      <Result label="Roblox group role sync" ok={robloxOk} detail={robloxDetail}/>
      <Result label="Discord role permissions" ok={null} detail="Not used. Discord roles never grant website access."/>
      <Result label="Google Forms delivery" ok={googleOk} detail={googleDetail}/>
      <Result label="Railway deployment" ok={Boolean(process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_GIT_COMMIT_SHA)} detail={process.env.RAILWAY_DEPLOYMENT_ID ? `Deployment ${process.env.RAILWAY_DEPLOYMENT_ID}; commit ${process.env.RAILWAY_GIT_COMMIT_SHA ?? "not provided"}.` : "Railway deployment metadata is unavailable in this runtime."}/>
    </tbody></table></div>
    <h2>Roblox roles detected for {session.user.username}</h2>
    {robloxRoles.length ? <ul>{robloxRoles.map((role)=><li key={`${role.groupId}:${role.roleId}`}>{role.groupName}: {role.roleName} <code>{role.roleId}</code></li>)}</ul> : <p>No roles detected.</p>}
    <h3>Permission tiers granted</h3>
    {matchedDetails.length ? <ul>{matchedDetails.map((mapping)=><li key={mapping.tier}>{mapping.tier} from {mapping.roles.join(", ")}</li>)}</ul> : <p>No configured tier role matched.</p>}
    <h3>Page access evaluation</h3><div className="tablewrap"><table className="stat"><thead><tr><th>Page</th><th>Result</th><th>Reason</th></tr></thead><tbody>{routes.map((path)=>{const rule=findRouteRule(path);const allowed=rule ? hasAnyCapability(resolvedTiers, rule.capabilities) : true; return <tr key={path}><td><code>{path}</code></td><td><span className={`pill ${allowed ? "pill-green" : "pill-red"}`}>{allowed ? "Allowed" : "Denied"}</span></td><td>{rule ? `${rule.prefix} requires any of: ${rule.capabilities.join(", ")}. Your grants: ${rule.capabilities.filter((cap)=>hasCapability(resolvedTiers, cap)).join(", ") || "none"}.` : "No permission rule applies."}</td></tr>})}</tbody></table></div>
  </main>;
}
