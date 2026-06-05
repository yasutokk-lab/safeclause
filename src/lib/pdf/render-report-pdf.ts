// Playwright Chromium を使った HTML → PDF レンダリング。
// 開発・運用方針：
//   - ローカル MVP 前提のため、リクエストごとに browser を launch / close する。
//     プロセスプール化は将来検討。
//   - launch には数秒のオーバーヘッドがあるが、Vercel 等の serverless ではなく
//     自分のマシンで動かす想定なので許容範囲。

import { chromium, type LaunchOptions } from "playwright";
import { generateReportHtml, type DocumentForReport } from "./report-html";

const LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
};

export async function renderReportPdf(
  doc: DocumentForReport,
): Promise<Buffer> {
  const html = generateReportHtml(doc);
  const browser = await chromium.launch(LAUNCH_OPTIONS);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      // CSS の @page で margin を設定しているが、Playwright 側でも明示しておく
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
