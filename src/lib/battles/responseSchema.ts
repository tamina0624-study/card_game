/**
 * AI審判(Claude)の応答本体を検証する zod スキーマ。
 *
 * 開発指示書.md「AI出力形式」節・docs/設計.md 4章に定義された形状をそのまま
 * zodスキーマ化したもの。`events[]` は `type` 以外のキー
 * (`character`/`effect`/`effectType`/`camera`/`message` 等)が自由記述で
 * 追加されることを許容するため `.passthrough()` を用いる
 * (docs/設計.md 0章-5「JSON出力スキーマ: events[].typeやeffectType等の値は
 * 固定enumにせず、AIの自由記述に依存する」)。
 *
 * `lib/battles/parseResponse.ts` からこのスキーマを使って
 * `responseSchema.safeParse()` による検証を行う。
 */

import { z } from "zod";

/**
 * イベント1件のスキーマ。`type` のみ必須(文字列)とし、それ以外のキーは
 * `.passthrough()` によりすべて自由記述で許容する。
 */
export const eventSchema = z.object({ type: z.string() }).passthrough();

/**
 * AI応答全体のスキーマ(開発指示書.md「AI出力形式」節と一字一句対応)。
 */
export const responseSchema = z.object({
  analysis: z.object({
    teamA: z.string(),
    teamB: z.string(),
    predictedWinner: z.enum(["teamA", "teamB"]),
  }),
  battleLog: z.array(
    z.object({
      turn: z.number(),
      message: z.string(),
    }),
  ),
  events: z.array(eventSchema),
  result: z.object({
    winner: z.enum(["teamA", "teamB"]),
    mvp: z.string(),
  }),
});

/** イベント1件の検証後の型。 */
export type BattleEvent = z.infer<typeof eventSchema>;

/** AI応答全体の検証後の型。`lib/battles/parseResponse.ts` の戻り値として使用する。 */
export type BattleAIResponse = z.infer<typeof responseSchema>;
