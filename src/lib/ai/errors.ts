// AI 層の型付きエラー。
// 呼び出し側（API ルート等）は instanceof で分岐し、HTTP ステータスや
// ユーザー向け文言を判定する。文字列メッセージ比較は脆いので避けること。

export class AIAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIAnalysisError";
  }
}

/**
 * 利用枠やレート制限（429）に達した場合のエラー。
 * 呼び出し側は HTTP 429 で返すこと。
 */
export class QuotaError extends AIAnalysisError {
  constructor(
    message = "AI の利用枠に達しました。課金・上限を確認してください。",
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

/**
 * AI 応答の構造が想定と違う / JSON パース失敗 / zod 検証失敗。
 */
export class MalformedResponseError extends AIAnalysisError {
  constructor(detail?: string) {
    super(
      detail
        ? `AI の応答を解析できませんでした: ${detail}`
        : "AI の応答を解析できませんでした。",
    );
    this.name = "MalformedResponseError";
  }
}

/**
 * AI が応答を拒否した場合（safety refusal 等）。
 */
export class RefusalError extends AIAnalysisError {
  constructor(detail?: string) {
    super(
      detail
        ? `AI が解析を拒否しました: ${detail}`
        : "AI が解析を拒否しました。",
    );
    this.name = "RefusalError";
  }
}

/**
 * AI 応答が max_tokens 上限に到達して切り詰められた場合。
 */
export class TruncatedResponseError extends AIAnalysisError {
  constructor() {
    super(
      "AI 応答がトークン上限に達しました。契約書を短くするか分割してください。",
    );
    this.name = "TruncatedResponseError";
  }
}
