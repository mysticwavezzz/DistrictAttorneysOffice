import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { siteConfig } from "@/config/site";
import { getCaseSharePreview } from "@/lib/case-share-preview";

export const runtime = "nodejs";
export const alt = "Limited shared case preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function CaseOpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await getCaseSharePreview(token);
  if (!record) notFound();
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "54px 68px", color: "#f7f4ea", background: "linear-gradient(135deg, #17243a 0%, #263c60 100%)", fontFamily: "Georgia, serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 78, height: 78, borderRadius: 39, border: "2px solid #d9bd77", color: "#e8d7a6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 35, fontWeight: 700 }}>HC</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 21, lineHeight: 1.35, color: "#e6eaf2" }}>
          <span>{siteConfig.county}</span><span>{siteConfig.name}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: "3px solid #d9bd77", paddingTop: 24 }}>
        <div style={{ color: "#e8d7a6", fontSize: 22, letterSpacing: 2 }}>SHARED CASE PREVIEW</div>
        <div style={{ fontSize: record.caseNumber.length > 52 ? 42 : 54, lineHeight: 1.15, fontWeight: 700 }}>{record.caseNumber}</div>
        <div style={{ color: "#d1d9e6", fontFamily: "Arial, sans-serif", fontSize: record.title.length > 64 ? 24 : 30 }}>{record.title.slice(0, 110)}</div>
        <div style={{ color: "#e8d7a6", fontFamily: "Arial, sans-serif", fontSize: 22 }}>{record.type || "Case"} · {record.stage || "Status not set"}</div>
      </div>
      <div style={{ color: "#d1d9e6", fontSize: 17 }}>Limited preview · Sign in to access case records</div>
    </div>,
    size,
  );
}
