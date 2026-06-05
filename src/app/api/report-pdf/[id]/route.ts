// GET /api/report-pdf/[id]
// 指定された Document（解析結果）の PDF レポートを生成して返す。
// セッションユーザー = Document.userId のもののみアクセス可。

import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderReportPdf } from "@/lib/pdf/render-report-pdf";
import {
  createDownloadBaseName,
  type DocumentForReport,
  type ReportRiskLevel,
} from "@/lib/pdf/report-html";

export const runtime = "nodejs";
// Playwright の launch + PDF 生成は数秒〜十数秒かかる。サーバ起動直後は更に遅い。
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインしてから実行してください。" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const document = await prisma.document.findFirst({
      where: { id, userId: sessionUser.userId },
      include: {
        analysisItems: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!document) {
      return NextResponse.json(
        { error: "指定された解析結果が見つかりません。" },
        { status: 404 },
      );
    }

    const reportDoc: DocumentForReport = {
      id: document.id,
      fileName: document.fileName,
      contractType: document.contractType,
      overallRisk: document.overallRisk as ReportRiskLevel,
      summary: document.summary,
      createdAt: document.createdAt.toISOString(),
      analysisItems: document.analysisItems.map((item) => ({
        id: item.id,
        title: item.title,
        clauseType: item.clauseType,
        riskLevel: item.riskLevel as ReportRiskLevel,
        issue: item.issue,
        marketDeviation: item.marketDeviation,
        reasoning: item.reasoning,
        suggestedRevision: item.suggestedRevision,
      })),
    };

    const pdfBuffer = await renderReportPdf(reportDoc);

    // ダウンロードファイル名（日本語ファイル名を含むため UTF-8 エンコード）
    const baseName = createDownloadBaseName(reportDoc.fileName);
    const filenameUtf8 = encodeURIComponent(`${baseName}-analysis.pdf`);
    // 互換のため ASCII フォールバックも付与
    const filenameAscii = `${baseName.replace(/[^\w.-]/g, "_")}-analysis.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBuffer.length),
        "Content-Disposition": `attachment; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[report-pdf] 想定外のエラー:", error);
    const message =
      error instanceof Error ? error.message : "PDF 生成中にエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
