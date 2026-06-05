// AI 解析結果の型定義 + zod スキーマ
// AI からの応答は zod でバリデーションし、enum 違反は明示的にエラー化する。

import { z } from "zod";

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ClauseTypeSchema = z.enum([
  "違約金",
  "責任制限",
  "解除",
  "知的財産",
  "秘密保持",
  "損害賠償",
  "その他",
]);
export type ClauseType = z.infer<typeof ClauseTypeSchema>;

export const ContractTypeSchema = z.enum([
  "NDA",
  "業務委託契約書",
  "その他",
]);
export type ContractType = z.infer<typeof ContractTypeSchema>;

export const AnalysisItemSchema = z.object({
  title: z.string(),
  clauseType: ClauseTypeSchema,
  riskLevel: RiskLevelSchema,
  issue: z.string(),
  marketDeviation: z.string(),
  reasoning: z.string(),
  suggestedRevision: z.string(),
});
export type AnalysisItem = z.infer<typeof AnalysisItemSchema>;

export const AnalysisResultSchema = z.object({
  contractType: ContractTypeSchema,
  overallRisk: RiskLevelSchema,
  summary: z.string(),
  // items の上限は呼び出し側で MAX_ANALYSIS_ITEMS を使って slice する。
  // Anthropic 構造化出力が maxItems を非サポートなので、ここでも .max() は外している。
  items: z.array(AnalysisItemSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * DB に保存する解析項目の上限。AI 応答に含まれる items を呼び出し側で
 * `.slice(0, MAX_ANALYSIS_ITEMS)` してから永続化する。
 */
export const MAX_ANALYSIS_ITEMS = 30;

/**
 * AI に渡せる契約書テキストの最大文字数。
 * これを超える契約書は冒頭部分のみ解析対象になり、
 * 呼び出し側で「後半は未解析」の警告を表示する責務がある。
 */
export const MAX_CONTRACT_TEXT_LENGTH = 30_000;
