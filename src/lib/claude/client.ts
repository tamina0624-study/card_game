/**
 * AI審判 接続基盤。
 *
 * - モジュール読み込み時に、`docs/システムプロンプト.md` を
 *   `fs.readFileSync` でUTF-8として読み込み、`SYSTEM_PROMPT` 定数としてキャッシュする
 *   (内容は一切改変せずそのまま `system` パラメータへ渡す)。
 * - 既定は `@anthropic-ai/sdk` の `Anthropic` クライアント(APIキーは環境変数
 *   `ANTHROPIC_API_KEY` から明示的に解決)。
 * - 環境変数 `OPENROUTER_API_KEY` が設定されている場合は、OpenRouter
 *   (OpenAI互換API、`openai` SDK + `baseURL` 差し替え)を優先して使用する
 *   (Anthropicの有料APIキーが用意できない開発環境向けの代替経路。
 *   モデルは `OPENROUTER_MODEL`、未設定時は無料枠モデル)。
 * - `MODEL` は環境変数 `ANTHROPIC_MODEL`(未設定時は `claude-opus-4-8`)。
 * - `callWithSystemPrompt` は任意のシステムプロンプト・`max_tokens` でAIを1回
 *   呼び出す汎用ヘルパー(`callBattleJudge` はこれを `SYSTEM_PROMPT` 固定で
 *   呼び出すラッパー)。戦闘以外の用途(例: `lib/characters/aiGenerate.ts` の
 *   キャラクター案生成)はこちらを直接使う。
 *
 * 参照: docs/設計.md 1.4「Claude API呼び出し方針」。
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

function resolveSystemPromptPath(): string {
  return path.resolve(process.cwd(), "docs", "システムプロンプト.md");
}

/**
 * `docs/システムプロンプト.md` の内容(無改変)。
 * モジュール読み込み時に一度だけ読み込み、以降はこの定数値をそのまま使い回す。
 */
export const SYSTEM_PROMPT: string = fs.readFileSync(
  resolveSystemPromptPath(),
  "utf-8",
);

/** Anthropic APIクライアント(APIキーは `ANTHROPIC_API_KEY` から明示的に解決)。 */
export const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** 使用するモデルID(`ANTHROPIC_MODEL` 未設定時は `claude-opus-4-8`)。 */
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-nano-30b-a3b:free";

const openrouterClient = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    })
  : null;

/**
 * 指定したシステムプロンプト・ユーザーメッセージでAIを1回呼び出し、応答テキストを返す。
 *
 * - `temperature`/`top_p`/`top_k`・`thinking` は指定しない(設計書1.4節のとおり)。
 * - `OPENROUTER_API_KEY` が設定されている場合はOpenRouter経由、それ以外は
 *   Anthropic経由で呼び出す。
 * - APIが投げるエラーはそのまま呼び出し元に伝播させる(ここでは捕捉しない)。
 */
export async function callWithSystemPrompt(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> {
  if (openrouterClient) {
    const response = await openrouterClient.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * AI審判に戦闘用のユーザーメッセージを送信し、応答テキストを返す。
 * システムプロンプトは `SYSTEM_PROMPT` をそのまま使用する。
 */
export async function callBattleJudge(userMessage: string): Promise<string> {
  return callWithSystemPrompt(SYSTEM_PROMPT, userMessage, 8000);
}
