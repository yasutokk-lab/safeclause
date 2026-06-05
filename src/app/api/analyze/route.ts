import { NextResponse } from "next/server";
import { createRequire } from "module";
import {
  analyzeContract,
  AIAnalysisError,
  QuotaError,
  MalformedResponseError,
  RefusalError,
  TruncatedResponseError,
  MAX_CONTRACT_TEXT_LENGTH,
  MAX_ANALYSIS_ITEMS,
} from "@/lib/ai/contract-analyzer";
import { getCurrentSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text?: string }> = require(
  "pdf-parse/lib/pdf-parse.js",
);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインしてから実行してください。" },
        { status: 401 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が設定されていません。" },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF ファイルを選択してください。" },
        { status: 400 },
      );
    }

    // MIME / 拡張子検証（フォームの accept は信頼できない）
    const filenameLower = file.name.toLowerCase();
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "PDF 形式のファイルのみ受け付けます。" },
        { status: 400 },
      );
    }
    if (!filenameLower.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "拡張子が .pdf のファイルを選択してください。" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "PDF サイズは 10MB 以下にしてください。" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text: string | undefined;
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text?.trim();
    } catch (e) {
      console.error("[analyze] PDF パース失敗:", e);
      return NextResponse.json(
        {
          error:
            "PDF を解析できませんでした。暗号化された PDF または破損したファイルの可能性があります。",
        },
        { status: 400 },
      );
    }

    if (!text) {
      return NextResponse.json(
        {
          error:
            "PDF からテキストを抽出できませんでした。スキャン画像のみで構成された PDF は OCR 未対応です。",
        },
        { status: 400 },
      );
    }

    // 長文契約書のサイレント切り捨てを検出して警告に反映
    const wasTruncated = text.length > MAX_CONTRACT_TEXT_LENGTH;
    const analysis = await analyzeContract(text);

    // 切り捨て発生時は summary 冒頭に明示。後段の UI で気付けるようにする。
    const summaryWithNotice = wasTruncated
      ? `[注意] 契約書テキストが ${MAX_CONTRACT_TEXT_LENGTH.toLocaleString()} 文字を超えたため、冒頭部分のみが AI 解析対象です。後半の条項（解除・賠償等が末尾にあることが多い）は未解析です。\n\n${analysis.summary}`
      : analysis.summary;

    const document = await prisma.document.create({
      data: {
        userId: sessionUser.userId,
        fileName: file.name,
        contractType: analysis.contractType,
        overallRisk: analysis.overallRisk,
        summary: summaryWithNotice,
        sourceText: text.slice(0, 50_000),
        analysisItems: {
          // 上限は呼び出し側でガード（Anthropic 構造化出力が maxItems 非対応のため）
          create: analysis.items.slice(0, MAX_ANALYSIS_ITEMS).map((item) => ({
            title: item.title,
            clauseType: item.clauseType,
            riskLevel: item.riskLevel,
            issue: item.issue,
            marketDeviation: item.marketDeviation,
            reasoning: item.reasoning,
            suggestedRevision: item.suggestedRevision,
          })),
        },
      },
      include: { analysisItems: true },
    });

    return NextResponse.json({
      ok: true,
      document,
      truncated: wasTruncated,
    });
  } catch (error) {
    // 型付きエラーは instanceof で分岐し、適切な HTTP ステータスを返す。
    // 認証/Prisma 等の一般エラーは 500 で握り潰さず必ずログに残す。
    if (error instanceof QuotaError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof TruncatedResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof RefusalError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof MalformedResponseError) {
      console.error("[analyze] AI 応答不正:", error);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof AIAnalysisError) {
      console.error("[analyze] AI 解析エラー:", error);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("[analyze] 想定外のエラー:", error);
    const message =
      error instanceof Error ? error.message : "解析処理中にエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
