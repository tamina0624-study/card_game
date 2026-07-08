/**
 * バトル(対戦)のリポジトリ層。
 *
 * MySQLへは直接接続せず、PHPブリッジ(`php/battles.php`)にHTTP経由でアクセスする
 * (`lib/characters/repository.ts`・`lib/decks/repository.ts` と同じ方針)。
 *
 * `resolveMvpCharacterId`(MVP名→キャラクターID解決、両デッキ全16体の名前との突合)は
 * decks/charactersリポジトリをまたぐ処理であり、`php/battles.php` が独自に
 * `php/decks.php` 相当のロジックをHTTP越しに呼び出す設計は事故のもとになるため、
 * PHP側では実装せずここ(TypeScript側)に残す。`saveBattleResult` は解決済みの
 * `mvpCharacterId` をプレーンな値としてbridgeに渡すのみとする。
 *
 * `POST /api/battles`(`src/app/api/battles/route.ts`)からの想定利用フローは以下の通り:
 *   1. `createPendingBattle` で `status='pending'` の行を先に作成しidを確保する。
 *   2. 両デッキ詳細(`lib/decks/repository.ts` の `getDeckById`)を取得し、
 *      `lib/battles/prompt.ts` でプロンプトを構築、`lib/battles/parseResponse.ts` の
 *      `generateBattleWithRetry` でAI応答を取得・検証する。
 *   3. 検証に成功した場合は `saveBattleResult` で結果一式を保存する。
 *   4. 失敗した場合は `markBattleFailed` で `status='failed'` とし理由を保存する。
 *   5. いずれの場合も `getBattleDetail` で最終的なレスポンス形状を取得して返す。
 */

import { BridgeError, callBridge } from "@/lib/bridge/client";
import { getDeckById } from "@/lib/decks/repository";
import type { BattleAIResponse } from "@/lib/battles/responseSchema";
import type { BattleDetail, BattleSummary } from "@/lib/types";

/**
 * 新規バトルを `status='pending'` で作成し、そのidを返す。
 * `deckAId`/`deckBId` が `decks` テーブルに実在することは呼び出し元
 * (API Route Handler)で事前に検証済みであることを前提とする。
 *
 * `storyBeatId`(章内の戦闘ビートとして実行する場合のみ指定、
 * `src/app/api/stories/beats/[beatId]/battle/route.ts` 参照)を渡すと、
 * `battles.story_beat_id` に記録され、そのビートの「これまでの挑戦」履歴
 * (`listStoryBattles`)や次のビート・次章のロック解除判定(勝利時)に使われる。
 * 通常のPvP対戦は省略する。
 */
export async function createPendingBattle(
  deckAId: number,
  deckBId: number,
  storyBeatId?: number
): Promise<number> {
  const result = await callBridge<{ id: number }>("battles.php", {
    method: "POST",
    body: {
      action: "create-pending",
      deckAId,
      deckBId,
      storyBeatId,
    },
  });
  return result.id;
}

/**
 * 指定ユーザーが特定の戦闘ビートで行った挑戦の履歴一覧を取得する
 * (ストーリー章詳細ページの、各戦闘ビートの「これまでの挑戦」用)。概要DTOのみ。
 */
export async function listStoryBattles(userId: number, beatId: number): Promise<BattleSummary[]> {
  return callBridge<BattleSummary[]>("battles.php", {
    query: { storyBeatId: beatId, userId },
  });
}

/**
 * 両デッキ(front/bench 全8体ずつ、計16体)のキャラクター名の中から、
 * `mvpName` と大文字小文字を無視して一致するキャラクターのidを解決する。
 * ヒットしない場合は `null` を返す(ベストエフォート解決)。
 */
async function resolveMvpCharacterId(
  deckAId: number,
  deckBId: number,
  mvpName: string
): Promise<number | null> {
  const deckA = await getDeckById(deckAId);
  const deckB = await getDeckById(deckBId);
  const allCharacters = [
    ...(deckA?.front ?? []),
    ...(deckA?.bench ?? []),
    ...(deckB?.front ?? []),
    ...(deckB?.bench ?? []),
  ];

  const normalizedMvpName = mvpName.trim().toLowerCase();
  const matched = allCharacters.find(
    (character) => character.name.trim().toLowerCase() === normalizedMvpName
  );
  return matched ? matched.id : null;
}

/**
 * AI応答検証済みの結果(`parsed`)をバトルへ保存する。
 * MVP名→キャラクターID解決はここ(TypeScript側)で行い、解決済みの値のみを
 * PHPブリッジへ渡す。`battles`/`battle_logs`/`battle_events` への書き込みは
 * ブリッジ側(`php/battles.php`)で単一トランザクションとして実行される。
 */
export async function saveBattleResult(
  battleId: number,
  parsed: BattleAIResponse,
  rawText: string
): Promise<void> {
  const battle = await getBattleDetail(battleId);
  if (!battle) {
    throw new Error(`バトル(id=${battleId})が見つかりません。`);
  }

  const mvpCharacterId = await resolveMvpCharacterId(battle.deckA.id, battle.deckB.id, parsed.result.mvp);

  await callBridge<{ ok: true }>("battles.php", {
    method: "POST",
    query: { id: battleId },
    body: { action: "save-result", parsed, rawText, mvpCharacterId },
  });
}

/** バトルを失敗として記録する(`status='failed'`、`error_message`に理由を保存)。 */
export async function markBattleFailed(battleId: number, errorMessage: string): Promise<void> {
  await callBridge<{ ok: true }>("battles.php", {
    method: "POST",
    query: { id: battleId },
    body: { action: "mark-failed", errorMessage },
  });
}

/**
 * id指定でバトル詳細(`docs/設計.md` 3章の `BattleDetail` 形状)を取得する。
 * 存在しない場合は `null` を返す。
 */
export async function getBattleDetail(id: number): Promise<BattleDetail | null> {
  try {
    return await callBridge<BattleDetail>("battles.php", { query: { id } });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404 && error.code === null) {
      return null;
    }
    throw error;
  }
}

/** バトル履歴一覧を取得する(概要情報のみ)。 */
export async function listBattles(): Promise<BattleSummary[]> {
  return callBridge<BattleSummary[]>("battles.php");
}
