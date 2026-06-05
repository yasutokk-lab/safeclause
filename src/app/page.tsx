"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type DocumentSummary = {
  id: string;
  fileName: string;
  contractType: string;
  overallRisk: RiskLevel;
  summary: string;
  createdAt: string;
  _count: { analysisItems: number };
};

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

async function safeFetchMe(): Promise<
  | { ok: true; user: SessionUser | null; documents: DocumentSummary[] }
  | { ok: false; error: string }
> {
  const res = await fetch("/api/me");
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      ok: false,
      error: `サーバーからの応答が読み取れませんでした（HTTP ${res.status}）。開発サーバーを一度止めて \`npm run dev\` で再起動してください。`,
    };
  }

  if (!res.ok || !parsed || typeof parsed !== "object") {
    return {
      ok: false,
      error: `サーバーエラーが発生しました（HTTP ${res.status}）。ターミナルのログを確認してください。`,
    };
  }

  const body = parsed as { user?: SessionUser | null; documents?: DocumentSummary[] };
  return {
    ok: true,
    user: body.user ?? null,
    documents: body.documents ?? [],
  };
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [riskFilter, setRiskFilter] = useState<"ALL" | RiskLevel>("ALL");
  /** 解析日時の並び: desc=新しい順, asc=古い順 */
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const riskClass = (risk: RiskLevel) => {
    if (risk === "HIGH") return "risk-high";
    if (risk === "MEDIUM") return "risk-medium";
    return "risk-low";
  };

  const topSummary = useMemo(() => {
    if (!documents.length) return null;
    const latest = documents[0];
    return `${latest.fileName} を解析済み（全体リスク: ${latest.overallRisk}）`;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = documents.filter((doc) => {
      const riskMatch = riskFilter === "ALL" || doc.overallRisk === riskFilter;
      const keywordMatch =
        !keyword ||
        doc.fileName.toLowerCase().includes(keyword) ||
        doc.contractType.toLowerCase().includes(keyword);
      return riskMatch && keywordMatch;
    });
    return [...filtered].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? tb - ta : ta - tb;
    });
  }, [documents, searchKeyword, riskFilter, sortOrder]);

  async function loadMe() {
    setLoading(true);
    try {
      const result = await safeFetchMe();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setUser(result.user);
      setDocuments(result.documents);
    } catch {
      setMessage("初期データの取得に失敗しました。ネットワークを確認してから再読み込みしてください。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      try {
        const result = await safeFetchMe();
        if (!active) return;
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setUser(result.user);
        setDocuments(result.documents);
      } catch {
        if (!active) return;
        setMessage("初期データの取得に失敗しました。ネットワークを確認してから再読み込みしてください。");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    loadInitialState();
    return () => {
      active = false;
    };
  }, []);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const url = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      authMode === "login"
        ? { email, password }
        : {
            name,
            email,
            password,
          };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "認証に失敗しました。");
      return;
    }

    setMessage("ログインしました。");
    setPassword("");
    await loadMe();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setDocuments([]);
    setMessage("ログアウトしました。");
  }

  async function handleAnalyzeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessage("PDFファイルを選択してください。");
      return;
    }

    setAnalyzing(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      // レスポンスが JSON でない（HTML エラーページ等）ケースに備えてテキスト経由でパース
      const raw = await res.text();
      let data: { ok?: boolean; document?: { id?: string }; error?: string; truncated?: boolean };
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        console.error("[analyze] レスポンスが JSON でない:", { status: res.status, raw });
        setMessage(
          `サーバーが想定外の応答を返しました (HTTP ${res.status})。ターミナルのログを確認してください。`,
        );
        return;
      }

      if (!res.ok) {
        setMessage(data.error ?? `解析に失敗しました (HTTP ${res.status})。`);
        return;
      }

      const newDocId = data.document?.id;
      if (data.truncated) {
        setMessage(
          "解析が完了しました。ただし契約書テキストが上限を超えたため、後半は未解析です（要約冒頭の注意書きを確認してください）。",
        );
      } else {
        setMessage("解析が完了しました。");
      }
      setFile(null);
      await loadMe();
      if (newDocId) {
        router.push(`/documents/${newDocId}`);
      }
    } catch (err) {
      // ネットワーク切断やランタイム例外。サイレント失敗を防ぐため明示
      console.error("[analyze] 通信エラー:", err);
      setMessage(
        `通信エラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return <main className="container">読み込み中...</main>;
  }

  return (
    <main className="container">
      <section className="card">
        <h1 style={{ display: "inline-flex", alignItems: "baseline", gap: 10, margin: 0 }}>
          SafeClause
          <Link
            href="/about"
            style={{ fontSize: 14, fontWeight: 400, color: "var(--primary)" }}
          >
            (About)
          </Link>
        </h1>
        <p className="muted">
          NDA / 業務委託契約書のPDFをアップロードし、不利条項・相場乖離・修正案を確認できます。
        </p>
        {message ? <p className="message">{message}</p> : null}
      </section>

      {!user ? (
        <section className="card">
          <div className="row">
            <button
              className={authMode === "login" ? "active-tab" : "tab"}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              ログイン
            </button>
            <button
              className={authMode === "register" ? "active-tab" : "tab"}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              新規登録
            </button>
          </div>
          <form onSubmit={handleAuthSubmit} className="form">
            {authMode === "register" ? (
              <label>
                名前
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="山田 太郎"
                />
              </label>
            ) : null}
            <label>
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              パスワード（8文字以上）
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit">{authMode === "login" ? "ログイン" : "登録する"}</button>
          </form>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="row row-between">
              <div>
                <h2>ようこそ {user.name ?? user.email} さん</h2>
                {topSummary ? <p className="muted">{topSummary}</p> : null}
              </div>
              <button onClick={handleLogout} className="secondary" type="button">
                ログアウト
              </button>
            </div>
            <form onSubmit={handleAnalyzeSubmit} className="form">
              <label>
                PDFファイル
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
              </label>
              <button type="submit" disabled={analyzing}>
                {analyzing ? "解析中..." : "契約書を解析する"}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>解析結果一覧</h2>
            <p className="muted">行をクリックすると詳細が開きます。CSV / PDF は詳細画面から保存できます。</p>
            {documents.length === 0 ? (
              <p className="muted">まだ解析結果がありません。</p>
            ) : (
              <div>
                <div className="row filter-row">
                  <input
                    className="search-input"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="ファイル名 / 契約種類で検索"
                  />
                  <select
                    className="filter-select"
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value as "ALL" | RiskLevel)}
                  >
                    <option value="ALL">全リスク</option>
                    <option value="HIGH">HIGHのみ</option>
                    <option value="MEDIUM">MEDIUMのみ</option>
                    <option value="LOW">LOWのみ</option>
                  </select>
                  <select
                    className="filter-select"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
                  >
                    <option value="desc">新しい順</option>
                    <option value="asc">古い順</option>
                  </select>
                </div>
                {filteredDocuments.length === 0 ? (
                  <p className="muted" style={{ marginTop: "10px" }}>
                    条件に一致する解析結果はありません。
                  </p>
                ) : null}
                <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>解析日時</th>
                      <th>ファイル名</th>
                      <th>契約種類</th>
                      <th>全体リスク</th>
                      <th>条項数</th>
                      <th aria-label="操作"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((doc) => (
                      <tr
                        key={doc.id}
                        className="clickable-row"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/documents/${doc.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`${doc.fileName} の詳細を開く`}
                      >
                        <td>{new Date(doc.createdAt).toLocaleString("ja-JP")}</td>
                        <td className="cell-filename">{doc.fileName}</td>
                        <td>{doc.contractType}</td>
                        <td>
                          <span className={`risk ${riskClass(doc.overallRisk)}`}>{doc.overallRisk}</span>
                        </td>
                        <td>{doc._count.analysisItems}</td>
                        <td className="cell-action">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="detail-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            詳細
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
