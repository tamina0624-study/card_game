/**
 * デッキのCRUDリポジトリ層。
 *
 * MySQLへは直接接続せず、PHPブリッジ(`php/decks.php`)にHTTP経由でアクセスする
 * (`lib/characters/repository.ts` と同じ方針)。
 *
 * エクスポートする関数名・シグネチャは元の `better-sqlite3` 実装から変えていないが、
 * HTTP呼び出しのため全て非同期(Promise)になった点に注意(呼び出し元は `await` が必要)。
 */

import { BridgeError, callBridge } from "@/lib/bridge/client";
import type { Deck, DeckInput, DeckSummary } from "@/lib/types";

/**
 * 指定した characterId が `characters` テーブルに存在しないことを表すエラー。
 * 呼び出し元(API Route Handler)はこのエラーを捕捉して 400 Bad Request を返すこと
 * (存在しないデッキ自体は `null` を返す設計とし、404として区別する)。
 */
export class CharacterNotFoundError extends Error {
  /** 呼び出し元がエラー種別を判別しやすいようにするための識別子。 */
  readonly code = "CHARACTER_NOT_FOUND" as const;
  readonly characterId: number;

  constructor(characterId: number) {
    super(`キャラクター(id=${characterId})が見つかりません。`);
    this.name = "CharacterNotFoundError";
    this.characterId = characterId;
  }
}

/**
 * 指定した deck_id が `battles` から参照されているため削除できないことを表すエラー。
 * 呼び出し元(API Route Handler)はこのエラーを捕捉して 409 Conflict を返すこと。
 */
export class DeckInUseError extends Error {
  readonly code = "DECK_IN_USE" as const;
  readonly deckId: number;

  constructor(deckId: number) {
    super(`デッキ(id=${deckId})は対戦で使用されているため削除できません。`);
    this.name = "DeckInUseError";
    this.deckId = deckId;
  }
}

/** PHPブリッジの `CHARACTER_NOT_FOUND` エラーから `characterId` を取り出す。 */
function toCharacterNotFoundError(error: BridgeError): CharacterNotFoundError {
  const characterId = typeof error.details?.characterId === "number" ? error.details.characterId : NaN;
  return new CharacterNotFoundError(characterId);
}

/**
 * デッキを新規作成する。
 * `cards` の各 `characterId` が `characters` テーブルに存在することの確認、
 * `decks` へのINSERTと `deck_cards` への一括INSERTはPHPブリッジ側(`php/decks.php`)で
 * 単一トランザクションとして実行される。存在しない `characterId` があれば
 * {@link CharacterNotFoundError} を投げる。
 */
export async function createDeck(input: DeckInput): Promise<Deck> {
  try {
    return await callBridge<Deck>("decks.php", { method: "POST", body: input });
  } catch (error) {
    if (error instanceof BridgeError && error.code === "CHARACTER_NOT_FOUND") {
      throw toCharacterNotFoundError(error);
    }
    throw error;
  }
}

/** デッキ一覧を取得する(概要情報のみ: id/name/ownerName/createdAt)。 */
export async function listDecks(): Promise<DeckSummary[]> {
  return callBridge<DeckSummary[]>("decks.php");
}

/**
 * id指定でデッキ1件を取得する(front/bench各4体のキャラクター全情報を含む)。
 * 存在しない場合は `null` を返す。
 */
export async function getDeckById(id: number): Promise<Deck | null> {
  try {
    return await callBridge<Deck>("decks.php", { query: { id } });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * デッキを更新する。
 * 対象デッキが存在しない場合は `null` を返す。存在しない `characterId` があれば
 * {@link CharacterNotFoundError} を投げる。
 */
export async function updateDeck(id: number, input: DeckInput): Promise<Deck | null> {
  try {
    return await callBridge<Deck>("decks.php", { method: "PUT", query: { id }, body: input });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404) {
      return null;
    }
    if (error instanceof BridgeError && error.code === "CHARACTER_NOT_FOUND") {
      throw toCharacterNotFoundError(error);
    }
    throw error;
  }
}

/**
 * デッキを削除する。
 * - 存在しない場合は `false` を返す(呼び出し元は404として扱う)。
 * - `battles` に当該 `deck_id`(`deck_a_id`/`deck_b_id`)が存在する場合、
 *   {@link DeckInUseError} を投げる(呼び出し元は409として扱う)。
 * - 削除に成功した場合は `true` を返す。
 */
export async function deleteDeck(id: number): Promise<boolean> {
  try {
    await callBridge<null>("decks.php", { method: "DELETE", query: { id } });
    return true;
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404) {
      return false;
    }
    if (error instanceof BridgeError && error.code === "DECK_IN_USE") {
      throw new DeckInUseError(id);
    }
    throw error;
  }
}
