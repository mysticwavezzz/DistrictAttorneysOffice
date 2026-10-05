import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || siteConfig.name).slice(0, 100);
  const description = (searchParams.get("description") || siteConfig.description).slice(0, 200);

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "54px 68px", color: "#f7f4ea", background: "linear-gradient(135deg, #17243a 0%, #263c60 100%)", fontFamily: "Georgia, serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 78, height: 78, borderRadius: 39, border: "2px solid #d9bd77", color: "#e8d7a6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 35, fontWeight: 700 }}>HC</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 21, lineHeight: 1.35, letterSpacing: 1.1, color: "#e6eaf2" }}>
          <span>{siteConfig.county}</span>
          <span>{siteConfig.name}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, borderTop: "3px solid #d9bd77", paddingTop: 26 }}>
        <div style={{ fontSize: title.length > 54 ? 42 : 54, lineHeight: 1.15, fontWeight: 700 }}>{title}</div>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#d1d9e6", fontSize: 25, lineHeight: 1.4 }}>{description}</div>
      </div>
      <div style={{ color: "#d9bd77", fontSize: 16, letterSpacing: 2, textTransform: "uppercase" }}>Harrison County Community Website</div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
