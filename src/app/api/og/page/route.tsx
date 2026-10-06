import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = (searchParams.get("path") || "/").slice(0, 180);
  const section = path.startsWith("/announcements/") ? "PRESS RELEASE"
    : path === "/report-crime" ? "COMMUNITY SAFETY"
      : path === "/contacts" ? "CONTACT THE OFFICE"
        : path.startsWith("/dashboard/cases") ? "STAFF CASEWORK"
          : path.startsWith("/dashboard") ? "STAFF PORTAL"
            : path === "/bulletin" ? "LAW ENFORCEMENT BULLETIN"
              : path === "/records-request" ? "PUBLIC RECORDS"
                : "DISTRICT ATTORNEY'S OFFICE";

  const seal = await readFile(join(process.cwd(), "public", "seal-optimized.webp"));
  const sealData = `data:image/webp;base64,${seal.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 38, background: "#f4f2ea", color: "#1d1b16", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "38px 48px", background: "#ffffff", border: "2px solid #c8c2b2", borderTop: "12px solid #39518d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {/* ImageResponse requires a direct image element to embed the bundled seal data. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sealData} width="116" height="132" alt="Harrison County District Attorney's Office seal" style={{ objectFit: "contain" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "#4a463c", fontSize: 21, letterSpacing: 1.4, textTransform: "uppercase" }}>{siteConfig.county}</div>
            <div style={{ color: "#2a3d6d", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 38, fontWeight: 700 }}>{siteConfig.name}</div>
            <div style={{ color: "#5a5344", fontSize: 20 }}>{siteConfig.tagline}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #e3d9bf", paddingTop: 20 }}>
          <div style={{ color: "#2a3d6d", fontSize: 18, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{section}</div>
          <div style={{ color: "#4a463c", fontSize: 17 }}>{siteConfig.county} · {siteConfig.name}</div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
