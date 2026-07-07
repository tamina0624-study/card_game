/**
 * キャラクターのCRUDリポジトリ層。
 *
 * MySQLへは直接接続せず、PHPブリッジ(`php/characters.php`)にHTTP経由でアクセスする
 * (docs/設計.md参照。スターサーバー等の共有ホスティングでは外部からのMySQL直接接続が
 * 許可されないため、PHPを介したHTTP API経由でのみDBを操作する)。
 *
 * エクスポートする関数名・シグネチャは元の `better-sqlite3` 実装から変えていないが、
 * HTTP呼び出しのため全て非同期(Promise)になった点に注意(呼び出し元は `await` が必要)。
 */

import { BridgeError, callBridge } from "@/lib/bridge/client";
import type { Character, CharacterInput, CharacterSummary } from "@/lib/types";

/**
 * 指定した character_id が `deck_cards` から参照されているため削除できないことを表すエラー。
 * 呼び出し元(API Route Handler)はこのエラーを捕捉して 409 Conflict を返すこと。
 */
export class CharacterInUseError extends Error {
  /** 呼び出し元がエラー種別を判別しやすいようにするための識別子。 */
  readonly code = "CHARACTER_IN_USE" as const;
  readonly characterId: number;

  constructor(characterId: number) {
    super(`キャラクター(id=${characterId})はデッキで使用されているため削除できません。`);
    this.name = "CharacterInUseError";
    this.characterId = characterId;
  }
}

/**
 * 指定した character_id がシステムキャラクター(`is_system = true`)であるため
 * 編集・削除できないことを表すエラー。
 * 呼び出し元(API Route Handler)はこのエラーを捕捉して 403 Forbidden を返すこと。
 */
export class SystemCharacterLockedError extends Error {
  readonly code = "SYSTEM_CHARACTER_LOCKED" as const;
  readonly characterId: number;

  constructor(characterId: number) {
    super(`キャラクター(id=${characterId})はシステムキャラクターのため編集・削除できません。`);
    this.name = "SystemCharacterLockedError";
    this.characterId = characterId;
  }
}

/**
 * キャラクターを新規作成する。
 * `characters` へのINSERTと `character_parameters` / `special_moves` への一括INSERTは
 * PHPブリッジ側(`php/characters.php`)で単一トランザクションとして実行される。
 */
export async function createCharacter(input: CharacterInput): Promise<Character> {
  return callBridge<Character>("characters.php", { method: "POST", body: input });
}

/** キャラクター一覧を取得する(パラメータ・必殺技を含む全情報)。 */
export async function listCharacters(): Promise<Character[]> {
  return callBridge<Character[]>("characters.php");
}

/** キャラクター詳細情報を一覧APIのサマリDTOへ変換する。 */
export function toCharacterSummary(character: Character): CharacterSummary {
  return {
    id: character.id,
    name: character.name,
    description: character.description,
    imageUrl: character.imageUrl,
    totalPoints: character.totalPoints,
    isSystem: character.isSystem,
    parameterCount: character.parameters.length,
    specialMoveCount: character.specialMoves.length,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

/** id指定でキャラクター1件を取得する。存在しない場合は `null` を返す。 */
export async function getCharacterById(id: number): Promise<Character | null> {
  try {
    return await callBridge<Character>("characters.php", { query: { id } });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404 && error.code === null) {
      return null;
    }
    throw error;
  }
}

/**
 * キャラクターを更新する。
 * 対象キャラクターが存在しない場合は `null` を返す。
 */
export async function updateCharacter(id: number, input: CharacterInput): Promise<Character | null> {
  try {
    return await callBridge<Character>("characters.php", { method: "PUT", query: { id }, body: input });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404 && error.code === null) {
      return null;
    }
    if (error instanceof BridgeError && error.code === "SYSTEM_CHARACTER_LOCKED") {
      throw new SystemCharacterLockedError(id);
    }
    throw error;
  }
}

/**
 * キャラクターを削除する。
 * - 存在しない場合は `false` を返す(呼び出し元は404として扱う)。
 * - `deck_cards` に当該 `character_id` を参照する行が存在する場合、削除を行わず
 *   {@link CharacterInUseError} を投げる(呼び出し元は409として扱う)。
 * - 削除に成功した場合は `true` を返す。
 */
export async function deleteCharacter(id: number): Promise<boolean> {
  try {
    await callBridge<null>("characters.php", { method: "DELETE", query: { id } });
    return true;
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404 && error.code === null) {
      return false;
    }
    if (error instanceof BridgeError && error.code === "CHARACTER_IN_USE") {
      throw new CharacterInUseError(id);
    }
    if (error instanceof BridgeError && error.code === "SYSTEM_CHARACTER_LOCKED") {
      throw new SystemCharacterLockedError(id);
    }
    throw error;
  }
}
