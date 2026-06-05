import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DocumentForReport } from "./report-download-buttons";
import { ReportDownloadButtons } from "./report-download-buttons";

type PageProps = {
  params: Promise<{ id: string }>;
};

function riskBadgeClass(risk: string) {
  if (risk === "HIGH") return "risk risk-high";
  if (risk === "MEDIUM") return "risk risk-medium";
  return "risk risk-low";
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    redirect("/");
  }

  const document = await prisma.document.findFirst({
    where: { id, userId: sessionUser.userId },
    include: {
      analysisItems: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!document) {
    notFound();
  }

  const reportDocument = JSON.parse(JSON.stringify(document)) as DocumentForReport;

  return (
    <main className="container">
      <section className="card">
        <p className="muted">
          <Link href="/">← 解析結果一覧に戻る</Link>
        </p>
        <div className="row row-between" style={{ alignItems: "flex-start" }}>
          <div>
            <h1>{document.fileName}</h1>
            <p className="muted">
              解析日時: {document.createdAt.toLocaleString("ja-JP")} / 契約種類:{" "}
              {document.contractType}
            </p>
          </div>
          <span className={riskBadgeClass(document.overallRisk)}>全体リスク: {document.overallRisk}</span>
        </div>
        <ReportDownloadButtons document={reportDocument} />
      </section>

      <section className="card">
        <h2>要約</h2>
        <p>{document.summary}</p>
      </section>

      <section className="card">
        <h2>条項ごとの指摘</h2>
        <div className="items">
          {document.analysisItems.map((item) => (
            <div key={item.id} className="item-card">
              <div className="row row-between">
                <strong>{item.title}</strong>
                <span className={riskBadgeClass(item.riskLevel)}>{item.riskLevel}</span>
              </div>
              <p>
                <b>条項種別:</b> {item.clauseType}
              </p>
              <p>
                <b>不利ポイント:</b> {item.issue}
              </p>
              <p>
                <b>相場との比較:</b> {item.marketDeviation}
              </p>
              <p>
                <b>根拠:</b> {item.reasoning}
              </p>
              <p>
                <b>修正案:</b> {item.suggestedRevision}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
