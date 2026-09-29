const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const errors = [];
const checked = new Set();

async function get(path) {
  const response = await fetch(new URL(path, base), { redirect: "manual" });
  checked.add(path);
  return response;
}

for (const path of ["/", "/contacts", "/records-request", "/report-crime"]) {
  const response = await get(path);
  if (response.status !== 200) { errors.push(`${path}: expected 200, got ${response.status}`); continue; }
  const html = await response.text();
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = tag[0].match(/\bsrc="([^"]+)"/)?.[1];
    if (!src) { errors.push(`${path}: image has no source`); continue; }
    const image = await fetch(new URL(src.replaceAll("&amp;", "&"), base));
    if (!image.ok || !image.headers.get("content-type")?.startsWith("image/")) errors.push(`${path} image ${src} failed or was not an image`);
  }
  for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const raw = match[1].replaceAll("&amp;", "&");
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/_next/") && !raw.startsWith("/api/")) {
      const pathname = new URL(raw, base).pathname;
      if (checked.has(pathname)) continue;
      const linked = await get(pathname);
      if (linked.status >= 400) errors.push(`${path} links to ${pathname}: HTTP ${linked.status}`);
    }
  }
  if (path === "/report-crime" && (!/required/.test(html) || !/name="signature"/.test(html))) errors.push("/report-crime: required validation fields/signature not rendered");
}

for (const path of ["/98981", "/dashboard/cases", "/dashboard/cases/calendar", "/dashboard/roster", "/settings", "/notifications"]) {
  const response = await get(path);
  if (![302, 303, 307, 308, 401, 403].includes(response.status)) errors.push(`${path}: unauthenticated request was not denied/redirected (HTTP ${response.status})`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log(`Smoke checks passed (${checked.size} routes checked).`);
