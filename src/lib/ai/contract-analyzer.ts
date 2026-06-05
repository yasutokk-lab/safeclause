// AI 契約書解析の公開エントリポイント。
// 呼び出し側（API ルート）はここから analyzeContract / 型 / エラーを取り込む。
// 将来的に別 AI プロバイダへ切り替える場合も、ここのシグネチャを変えずに済むよう
// 実装層（anthropic.ts 等）と分離している。

import { analyzeWithAnthropic } from "./anthropic";

export { analyzeWithAnthropic as analyzeContract } from "./anthropic";

export {
  type AnalysisResult,
  type AnalysisItem,
  type RiskLevel,
  type ClauseType,
  type ContractType,
  MAX_CONTRACT_TEXT_LENGTH,
  MAX_ANALYSIS_ITEMS,
} from "./types";

export {
  AIAnalysisError,
  QuotaError,
  MalformedResponseError,
  RefusalError,
  TruncatedResponseError,
} from "./errors";

// 将来別実装に切り替える場合の参考用ヘルパ（現状未使用）。
// 環境変数等で実装を選択したくなった時に使う。
export type ContractAnalyzer = (
  contractText: string,
) => ReturnType<typeof analyzeWithAnthropic>;

export const defaultAnalyzer: ContractAnalyzer = analyzeWithAnthropic;
