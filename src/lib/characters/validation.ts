/**
 * キャラクター登録・更新用の zod バリデーションスキーマ。
 *
 * 重要(開発指示書「確定事項」2番、docs/設計.md 補足参照):
 * 「総ポイント100の制約」はキャラクターの登録・更新時にこのモジュール(アプリ側)でのみ
 * 検証する。AI審判(lib/claude, lib/battles 配下のプロンプト生成・応答パース処理)は
 * 100ポイント制約を一切検証しない設計であり、このモジュールは lib/claude や
 * lib/battles のいずれにも依存しない(依存関係を持たない・持たせてはならない)。
 * AI側は「100ポイント制約はアプリ側チェック済み」という前提のもとで戦闘を裁定する。
 */

import { z } from "zod";
import type { CharacterInput } from "@/lib/types";

/** キャラクター1体に許容する合計ポイント(開発指示書「ユーザーには100ポイントが与えられる」)。 */
export const MAX_TOTAL_POINTS = 100;

/**
 * パラメーター1件のスキーマ。
 * パラメーター名・値ともに完全自由入力だが、値は 0〜100 の整数に収める
 * (DB側の `character_parameters.value` の CHECK 制約と同じ範囲)。
 */
export const parameterSchema = z.object({
  name: z.string().trim().min(1, "パラメーター名を入力してください"),
  value: z
    .number()
    .int("パラメーターの値は整数で入力してください")
    .min(0, "パラメーターの値は0以上にしてください")
    .max(100, "パラメーターの値は100以下にしてください"),
});

/** 必殺技1件のスキーマ。技名は必須、説明・演出テキストは任意入力。 */
export const specialMoveSchema = z.object({
  name: z.string().trim().min(1, "必殺技名を入力してください"),
  description: z.string().optional(),
  flavorText: z.string().optional(),
});

/**
 * キャラクター登録・更新リクエストボディ全体のスキーマ。
 * `parameters[].value` の合計が {@link MAX_TOTAL_POINTS} を超える場合は
 * `superRefine` でカスタムissueを発行し、`path: ["parameters"]` に
 * 日本語エラーメッセージを付与する。
 */
export const characterInputSchema = z
  .object({
    name: z.string().trim().min(1, "キャラクター名を入力してください"),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    parameters: z
      .array(parameterSchema)
      .min(1, "パラメーターを1件以上登録してください"),
    specialMoves: z.array(specialMoveSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const totalPoints = data.parameters.reduce((sum, parameter) => sum + parameter.value, 0);
    if (totalPoints > MAX_TOTAL_POINTS) {
      ctx.addIssue({
        code: "custom",
        path: ["parameters"],
        message: "パラメーターの合計は100ポイント以下にしてください",
      });
    }
  });

/** `characterInputSchema` によるパース後の型(zodスキーマから逆算)。 */
export type CharacterInputParsed = z.infer<typeof characterInputSchema>;

export type ValidateCharacterInputResult =
  | { success: true; data: CharacterInputParsed }
  | { success: false; errors: z.ZodError<CharacterInput> };

/**
 * 未検証の入力(APIリクエストボディ等)をキャラクター登録・更新用の形として
 * 検証するヘルパー関数。
 *
 * 100ポイント制約を含むすべての検証はこの関数(ひいてはアプリ側)で完結し、
 * AI審判側の判定結果には一切依存しない。
 */
export function validateCharacterInput(input: unknown): ValidateCharacterInputResult {
  const result = characterInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
