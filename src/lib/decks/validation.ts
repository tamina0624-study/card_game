/**
 * デッキ登録・更新用の zod バリデーションスキーマ。
 *
 * 重要(開発指示書「デッキ」章、docs/設計.md 0章-2番参照):
 * 「1デッキは8枚、前衛4枚・控え4枚」という構成ルールはこのモジュール(アプリ側)で
 * 検証する。ただし `characterId` が実際に `characters` テーブルに存在するかどうかは
 * DBアクセスが必要なため、このモジュールでは検証しない(リポジトリ層
 * `lib/decks/repository.ts` の責務とする)。
 */

import { z } from "zod";
import type { DeckInput } from "@/lib/types";

/** 1デッキに登録するカード枚数(開発指示書「1デッキは8枚」)。 */
export const DECK_SIZE = 8;
/** 前衛の枚数(開発指示書「戦闘開始時に前衛4枚を選択する」)。 */
export const FRONT_SIZE = 4;
/** 控えの枚数(開発指示書「残り4枚は控えとなる」)。 */
export const BENCH_SIZE = 4;

/** デッキ1枚分のカード指定のスキーマ。 */
export const deckCardSchema = z.object({
  characterId: z
    .number()
    .int("characterIdは整数で指定してください")
    .positive("characterIdは正の整数で指定してください"),
  role: z.enum(["front", "bench"], {
    message: "roleは'front'または'bench'のいずれかを指定してください",
  }),
});

/**
 * デッキ登録・更新リクエストボディ全体のスキーマ。
 *
 * `superRefine` で以下を検証し、違反時は日本語メッセージのカスタムissueを発行する
 * (存在確認が必要な `characterId` の実在チェックはここでは行わない)。
 * - `cards` 内の `characterId` がすべて一意であること(同じキャラクターの重複登録禁止)
 * - `role === 'front'` がちょうど {@link FRONT_SIZE} 件であること
 * - `role === 'bench'` がちょうど {@link BENCH_SIZE} 件であること
 */
export const deckInputSchema = z
  .object({
    name: z.string().trim().min(1, "デッキ名を入力してください"),
    ownerName: z.string().optional(),
    cards: z
      .array(deckCardSchema)
      .length(DECK_SIZE, `デッキには${DECK_SIZE}枚ちょうど登録してください`),
  })
  .superRefine((data, ctx) => {
    const characterIds = data.cards.map((card) => card.characterId);
    const uniqueCharacterIds = new Set(characterIds);
    if (uniqueCharacterIds.size !== characterIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "同じキャラクターを同一デッキに複数枚登録することはできません",
      });
    }

    const frontCount = data.cards.filter((card) => card.role === "front").length;
    if (frontCount !== FRONT_SIZE) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: `前衛(front)はちょうど${FRONT_SIZE}件指定してください`,
      });
    }

    const benchCount = data.cards.filter((card) => card.role === "bench").length;
    if (benchCount !== BENCH_SIZE) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: `控え(bench)はちょうど${BENCH_SIZE}件指定してください`,
      });
    }
  });

/** `deckInputSchema` によるパース後の型(zodスキーマから逆算)。 */
export type DeckInputParsed = z.infer<typeof deckInputSchema>;

export type ValidateDeckInputResult =
  | { success: true; data: DeckInputParsed }
  | { success: false; errors: z.ZodError<DeckInput> };

/**
 * 未検証の入力(APIリクエストボディ等)をデッキ登録・更新用の形として検証するヘルパー関数。
 *
 * `characterId` が実在するキャラクターを指すかどうかはここでは検証しない
 * (DBアクセスが必要なため `lib/decks/repository.ts` の各関数が呼び出し時に検証する)。
 */
export function validateDeckInput(input: unknown): ValidateDeckInputResult {
  const result = deckInputSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
