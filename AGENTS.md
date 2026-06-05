<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SafeClause（契約書リスク判定）プロジェクト指示書

## このプロジェクトについて

徳島保彦さんの **NDA・業務委託契約書レビュー一次パス自動化アプリ**。一次ユーザーは徳島さん本人、副次的に **ポートフォリオ第 3 弾** として公開予定。

## 流儀・設計原則

### CLAUDE.md グローバル流儀（徳島さん全プロジェクト共通）

- **過去案件（tegata / slide-gen2 / kintai-reppa 等）の構造を踏襲前提にしない**。「前回はこうだから今回もこう」は避け、毎回ゼロベースで再検討する。結果として同じ構造になるのは可
- **ファイル管理の文化**（`.gitignore` / `.env.example` 等）は徳島さんの慣れに揃える
- **アーキテクチャ（パッケージ構成・CLI・データモデル）は毎回独立判断**

### 本プロジェクト固有

- **AI クライアントは抽象化層を経由**：`@/lib/ai/contract-analyzer` を使用。`@anthropic-ai/sdk` を直接 import するのは `lib/ai/anthropic.ts` 内のみに留める
- **型付きエラーで分岐**：`QuotaError` / `MalformedResponseError` / `RefusalError` / `TruncatedResponseError` を `instanceof` で判定。メッセージ文字列比較は使わない
- **zod スキーマと JSON Schema を同期**：`types.ts` の zod 定義と `anthropic.ts` の `ANALYSIS_JSON_SCHEMA` は意味が一致している必要がある。enum 追加時は両方更新
- **プロンプトインジェクション対策**：契約書テキストは `<contract>...</contract>` で囲む。`SYSTEM_PROMPT` の指示文を勝手に弱めない
- **CSV インジェクション対策**：CSV 出力時は `escapeCsvCell()` を必ず通す。`= + - @` 前置の `'` エスケープは削除しない

## 技術スタック

| レイヤ | 採用 |
|---|---|
| フロント | Next.js 16（App Router, TypeScript） |
| バックエンド | Prisma 7 + SQLite（`@prisma/adapter-better-sqlite3`） |
| AI | Anthropic Claude Opus 4.8（`@anthropic-ai/sdk` ^0.100.x） |
| バリデーション | zod 4 |
| 認証 | jose (JWT Cookie) + bcryptjs |
| PDF 解析 | pdf-parse |

## 開発フロー

1. データモデル変更時は `prisma/schema.prisma` を更新 → `npm run db:push`
2. AI スキーマ変更時は `lib/ai/types.ts`（zod）と `lib/ai/anthropic.ts`（JSON Schema）を同時更新
3. 実装後、`npm run dev` でローカル動作確認
4. コミット・push

## 命名規則

- ファイル名：kebab-case（例：`contract-analyzer.ts`）
- 関数名：camelCase（例：`analyzeContract`）
- 型名：PascalCase（例：`AnalysisResult`）
- DB カラム名：camelCase（Prisma 規約）
- TypeScript 型は zod スキーマから `z.infer<typeof Schema>` で導出

## やってはいけないこと

- AI 応答を zod バリデーションなしで DB に直接書き込まない（enum 違反混入の温床）
- `process.env.OPENAI_API_KEY` を新たに参照するコードを追加しない（Claude へ全面移行済み）
- 契約書テキストを `<contract>` タグなしで AI に直接渡さない（プロンプトインジェクション耐性が落ちる）
- 認証エラーを `catch {}` でサイレントに握り潰さない（必ず `console.error` を残す）
- `escapeCsvCell` を経由しない値を CSV 出力に含めない
