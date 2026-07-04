/**
 * AI審判(Claude)応答のJSON抽出・検証・リトライ用ヘルパー。
 *
 * docs/設計.md 1.4「Claude API呼び出し方針」のレスポンス解析フローに対応する:
 *   1. `callBattleJudge`(`lib/claude/client.ts`)が返す応答テキストから
 *      Markdownのコードフェンス(```json ... ``` 等)を除去してJSONとしてパースする
 *      (`extractJson`)。
 *   2. `responseSchema`(`lib/battles/responseSchema.ts`)で構造検証する
 *      (`parseBattleResponse`)。
 *   3. 失敗した場合、訂正指示を付加して1回だけ再試行する
 *      (`generateBattleWithRetry`)。2回失敗した場合は生テキストを保持した
 *      専用エラー `BattleGenerationError` を投げる(呼び出し元でこれを捕捉し
 *      `battles.status = 'failed'` / `error_message` へ反映する想定、タスク11)。
 */

import { callBattleJudge } from "@/lib/claude/client";
import { responseSchema, type BattleAIResponse } from "@/lib/battles/responseSchema";

/**
 * Claudeの応答テキストからJSON部分を抽出し `JSON.parse` した結果を返す。
 *
 * 先頭・末尾のMarkdownコードフェンス(```json 、``` など、大文字小文字問わず)を
 * 正規表現で除去し、トリムしたうえで `JSON.parse` を行う。フェンスが無い場合は
 * トリムのみ行われる。JSONとして不正な場合は `JSON.parse` がそのまま例外を投げる
 * (呼び出し元の `parseBattleResponse` で捕捉する)。
 */
export function extractJson(text: string): unknown {
  const withoutCodeFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(withoutCodeFence);
}

/** `parseBattleResponse` の戻り値。 */
export type ParseBattleResponseResult =
  | { success: true; data: BattleAIResponse }
  | { success: false; error: string };

/**
 * Claudeの応答テキストを `extractJson` でJSON化したうえで `responseSchema` により
 * 構造検証する。
 *
 * - JSONとしてパースできない場合(`extractJson` が例外を投げた場合)は
 *   `{ success: false, error }` を返す(`error` にはパースエラーの理由を含める)。
 * - パースできたがスキーマに一致しない場合も `{ success: false, error }` を返す
 *   (`error` にはzodの検証エラー内容を含める)。
 * - 検証に成功した場合は `{ success: true, data }` を返す。
 */
export function parseBattleResponse(text: string): ParseBattleResponseResult {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `AI応答をJSONとしてパースできませんでした: ${reason}`,
    };
  }

  const result = responseSchema.safeParse(json);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: `AI応答が期待したJSON形式と一致しませんでした: ${result.error.message}`,
  };
}

/**
 * AI応答の検証に(初回・訂正リトライの)2回とも失敗した場合に投げる専用エラー。
 * 監査・デバッグ用に、2回目(最終)の生テキストを `rawText` に保持する。
 */
export class BattleGenerationError extends Error {
  /** 検証に失敗した最終(2回目)の生テキスト。 */
  rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "BattleGenerationError";
    this.rawText = rawText;
  }
}

/**
 * 訂正リトライ時にオリジナルのユーザーメッセージへ付加する指示文。
 * 直前のAI応答(生テキスト)を提示したうえで、指定のJSON形式のみを
 * 出力し直すよう明示的に指示する。
 */
function buildRetryMessage(originalUserMessage: string, previousRawText: string, reason: string): string {
  return [
    originalUserMessage,
    "---",
    "【直前のあなたの出力】",
    previousRawText,
    "---",
    `前回の出力はJSONとして不正でした(理由: ${reason})。指定のJSON形式のみを出力し直してください。` +
      "Markdownのコードブロックや説明文などは一切含めないこと。",
  ].join("\n\n");
}

/**
 * `callBattleJudge` を呼び出しAI審判の応答を取得、`parseBattleResponse` で検証する。
 * 検証に失敗した場合は訂正指示を付加したメッセージで1回だけ再試行する。
 *
 * - 1回目・2回目のいずれかで検証に成功した場合は `{ data, rawText }` を返す
 *   (`rawText` は検証に成功した回の生テキスト)。
 * - 2回とも検証に失敗した場合は `BattleGenerationError` を投げる
 *   (`rawText` には2回目の生テキストを保持する)。
 */
export async function generateBattleWithRetry(
  userMessage: string,
): Promise<{ data: BattleAIResponse; rawText: string }> {
  const firstRawText = await callBattleJudge(userMessage);
  const firstResult = parseBattleResponse(firstRawText);
  if (firstResult.success) {
    return { data: firstResult.data, rawText: firstRawText };
  }

  const retryMessage = buildRetryMessage(userMessage, firstRawText, firstResult.error);
  const secondRawText = await callBattleJudge(retryMessage);
  const secondResult = parseBattleResponse(secondRawText);
  if (secondResult.success) {
    return { data: secondResult.data, rawText: secondRawText };
  }

  throw new BattleGenerationError(
    `AI応答のJSON検証に2回失敗しました。1回目: ${firstResult.error} / 2回目: ${secondResult.error}`,
    secondRawText,
  );
}
