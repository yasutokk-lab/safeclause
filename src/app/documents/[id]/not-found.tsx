import Link from "next/link";

export default function DocumentNotFound() {
  return (
    <main className="container">
      <section className="card">
        <h1>見つかりません</h1>
        <p className="muted">この解析結果は存在しないか、閲覧権限がありません。</p>
        <p>
          <Link href="/">一覧に戻る</Link>
        </p>
      </section>
    </main>
  );
}
