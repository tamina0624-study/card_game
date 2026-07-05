/**
 * キャラクター作成画面向け: 「雰囲気・イメージ」の自由記述からAIにキャラクター案
 * (名前・説明・パラメーター・必殺技)を考案してもらう機能。
 *
 * 画像は対象外(開発指示書どおり、画像は各ユーザーが自分で用意しアップロードする)。
 * ここで返す値はあくまで `CharacterForm` の入力欄を埋める叩き台であり、
 * ユーザーは生成後も自由に編集してから送信できる。
 *
 * `lib/characters/validation.ts` の「100ポイント制約はAIに依存せずアプリ側でのみ
 * 検証する」という方針(登録・更新時の最終防衛線)は変わらない。そのうえで
 * 手戻りを減らすため、この生成結果自体も合計100ポイント以内になるよう
 * `lib/battles/parseResponse.ts` と同様のJSON抽出・zod検証・1回だけの訂正リトライを行う。
 */

import { z } from "zod";
import { callWithSystemPrompt } from "@/lib/claude/client";
import { MAX_TOTAL_POINTS } from "@/lib/characters/validation";

const GENERATOR_SYSTEM_PROMPT = [
  "あなたはカードゲームのキャラクターデザイナーです。",
  "ユーザーが入力する「雰囲気・イメージ」の自由記述から、そのゲーム世界で使えるキャラクター1体分の設定を考案します。",
  "パラメーター名・必殺技の内容は完全に自由な発想でよく、既存の作品名やキャラクター名をそのまま使わず、雰囲気だけを汲み取ったオリジナルの設定にしてください。",
  "出力は必ず指定されたJSON形式のみとし、Markdownのコードブロックや説明文などは一切含めないでください。",
].join("\n");

const generatedParameterSchema = z.object({
  name: z.string().trim().min(1),
  value: z.number().int().min(0).max(100),
});

const generatedSpecialMoveSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  flavorText: z.string().trim().min(1),
});

/** AIの生成結果本体のスキーマ。パラメーター合計が100を超える場合はcustom issueを発行する。 */
const generationResultSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    parameters: z.array(generatedParameterSchema).min(2).max(6),
    specialMoves: z.array(generatedSpecialMoveSchema).min(1).max(3),
  })
  .superRefine((data, ctx) => {
    const total = data.parameters.reduce((sum, parameter) => sum + parameter.value, 0);
    if (total > MAX_TOTAL_POINTS) {
      ctx.addIssue({
        code: "custom",
        path: ["parameters"],
        message: `パラメーターの合計は${MAX_TOTAL_POINTS}ポイント以下にしてください`,
      });
    }
  });

/** `generateCharacterConcept` の戻り値の型。 */
export type CharacterGenerationResult = z.infer<typeof generationResultSchema>;

/** Claude/OpenRouter応答テキストからコードフェンスを除去してJSONパースする(`lib/battles/parseResponse.ts` の `extractJson` と同等)。 */
function extractJson(text: string): unknown {
  const withoutCodeFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(withoutCodeFence);
}

function buildUserMessage(concept: string): string {
  const exampleJson = JSON.stringify(
    {
      name: "キャラクター名",
      description: "キャラクターの説明(2〜4文程度)",
      parameters: [{ name: "パラメーター名", value: 0 }],
      specialMoves: [{ name: "技名", description: "技の効果・説明", flavorText: "発動時の演出テキスト" }],
    },
    null,
    2,
  );

  return [
    "以下の「雰囲気・イメージ」をもとに、カードゲーム用のキャラクター案を1体分考案してください。",
    "",
    "【雰囲気・イメージ】",
    concept,
    "",
    "【出力条件】",
    `- parameters: 2〜6個。名前は完全自由(雰囲気に合わせて創作してよい)。値は0〜100の整数で、合計は${MAX_TOTAL_POINTS}ポイント以下にすること。`,
    "- specialMoves: 1〜3個。技名・説明・演出テキスト(発動時の実況演出向けの短い一文)をすべて日本語で考案すること。",
    "- description: キャラクター説明を2〜4文程度で、雰囲気・イメージを反映した内容にすること。",
    "- 出力は以下のJSON形式のみとし、Markdownのコードブロックや説明文などは一切含めないこと。",
    "",
    exampleJson,
  ].join("\n");
}

type ParseResult =
  | { success: true; data: CharacterGenerationResult }
  | { success: false; error: string };

function parseGenerationResponse(text: string): ParseResult {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { success: false, error: `AI応答をJSONとしてパースできませんでした: ${reason}` };
  }

  const result = generationResultSchema.safeParse(json);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: `AI応答が期待した形式と一致しませんでした: ${result.error.message}`,
  };
}

function buildRetryMessage(originalUserMessage: string, previousRawText: string, reason: string): string {
  return [
    originalUserMessage,
    "---",
    "【直前のあなたの出力】",
    previousRawText,
    "---",
    `前回の出力は不正でした(理由: ${reason})。指定のJSON形式のみを出力し直してください。` +
      "Markdownのコードブロックや説明文などは一切含めないこと。",
  ].join("\n\n");
}

/** キャラクター案生成の検証に(初回・訂正リトライの)2回とも失敗した場合に投げる専用エラー。 */
export class CharacterGenerationError extends Error {
  /** 検証に失敗した最終(2回目)の生テキスト。 */
  rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "CharacterGenerationError";
    this.rawText = rawText;
  }
}

/**
 * ユーザーが入力した「雰囲気・イメージ」からキャラクター案を生成する。
 *
 * 検証に失敗した場合は訂正指示を付加したメッセージで1回だけ再試行し、
 * それでも失敗した場合は {@link CharacterGenerationError} を投げる。
 */
export async function generateCharacterConcept(concept: string): Promise<CharacterGenerationResult> {
  const userMessage = buildUserMessage(concept);

  const firstRawText = await callWithSystemPrompt(GENERATOR_SYSTEM_PROMPT, userMessage, 2000);
  const firstResult = parseGenerationResponse(firstRawText);
  if (firstResult.success) {
    return firstResult.data;
  }

  const retryMessage = buildRetryMessage(userMessage, firstRawText, firstResult.error);
  const secondRawText = await callWithSystemPrompt(GENERATOR_SYSTEM_PROMPT, retryMessage, 2000);
  const secondResult = parseGenerationResponse(secondRawText);
  if (secondResult.success) {
    return secondResult.data;
  }

  throw new CharacterGenerationError(
    `AI応答の検証に2回失敗しました。1回目: ${firstResult.error} / 2回目: ${secondResult.error}`,
    secondRawText,
  );
}
