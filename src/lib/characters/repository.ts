/**
 * キャラクターのCRUDリポジトリ層。
 *
 * `better-sqlite3` を直接使用し、`characters` / `character_parameters` / `special_moves`
 * の3テーブルへの読み書きを `db.transaction()` でまとめて行う(docs/設計.md 2章参照)。
 *
 * - 作成・更新時は `character_parameters` / `special_moves` を一旦全削除してから
 *   入力内容で再挿入する(パラメータ・必殺技の並び替え/削除/追加を単純な差分計算なしで
 *   反映できるようにするため)。
 * - `characters.total_points` にはパラメータ合計値を作成・更新の都度計算して保存する
 *   (`lib/characters/validation.ts` で100ポイント以下であることは検証済みの入力を受け取る前提)。
 * - `deleteCharacter` は `deck_cards` に当該 `character_id` が存在する場合、
 *   {@link CharacterInUseError} を投げて削除を拒否する(呼び出し元のAPI Route Handlerで
 *   409 Conflict として扱う)。
 */

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/client";
import type {
  Character,
  CharacterInput,
  CharacterParameter,
  CharacterSummary,
  SpecialMove,
} from "@/lib/types";

/** `characters` テーブルの行(スキーマの列名そのまま)。 */
type CharacterRow = {
  id: number;
  name: string;
  image_url: string | null;
  description: string | null;
  total_points: number;
  created_at: string;
  updated_at: string;
};

/** `character_parameters` テーブルの行。 */
type ParameterRow = {
  id: number;
  character_id: number;
  name: string;
  value: number;
  sort_order: number;
};

/** `special_moves` テーブルの行。 */
type MoveRow = {
  id: number;
  character_id: number;
  name: string;
  description: string | null;
  flavor_text: string | null;
  sort_order: number;
};

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

/** パラメーター合計値(= `total_points` に保存する値)を計算する。 */
function computeTotalPoints(parameters: CharacterInput["parameters"]): number {
  return parameters.reduce((sum, parameter) => sum + parameter.value, 0);
}

/** `character_parameters` / `special_moves` の行をアプリ側の型に変換する。 */
function toParameter(row: ParameterRow): CharacterParameter {
  return { id: row.id, name: row.name, value: row.value, sortOrder: row.sort_order };
}

function toSpecialMove(row: MoveRow): SpecialMove {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    flavorText: row.flavor_text,
    sortOrder: row.sort_order,
  };
}

/** `characters` 1行 + 関連するパラメーター/必殺技を取得し、`Character` 型に組み立てる。 */
function assembleCharacter(db: Database.Database, row: CharacterRow): Character {
  const parameterRows = db
    .prepare(
      `SELECT * FROM character_parameters WHERE character_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(row.id) as ParameterRow[];
  const moveRows = db
    .prepare(`SELECT * FROM special_moves WHERE character_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(row.id) as MoveRow[];

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    totalPoints: row.total_points,
    parameters: parameterRows.map(toParameter),
    specialMoves: moveRows.map(toSpecialMove),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** id指定でキャラクター1件を取得する(内部用、既存のDB接続を再利用する)。 */
function findCharacterById(db: Database.Database, id: number): Character | null {
  const row = db.prepare(`SELECT * FROM characters WHERE id = ?`).get(id) as
    | CharacterRow
    | undefined;
  if (!row) {
    return null;
  }
  return assembleCharacter(db, row);
}

/**
 * `character_parameters` / `special_moves` を全削除してから入力内容で再挿入する。
 * 作成時・更新時の両方から呼び出す共通処理。
 */
function replaceParametersAndMoves(db: Database.Database, characterId: number, input: CharacterInput): void {
  db.prepare(`DELETE FROM character_parameters WHERE character_id = ?`).run(characterId);
  db.prepare(`DELETE FROM special_moves WHERE character_id = ?`).run(characterId);

  const insertParameter = db.prepare(
    `INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES (?, ?, ?, ?)`
  );
  input.parameters.forEach((parameter, index) => {
    insertParameter.run(characterId, parameter.name, parameter.value, index);
  });

  const insertMove = db.prepare(
    `INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  (input.specialMoves ?? []).forEach((move, index) => {
    insertMove.run(characterId, move.name, move.description ?? null, move.flavorText ?? null, index);
  });
}

/**
 * キャラクターを新規作成する。
 * `characters` へのINSERTと `character_parameters` / `special_moves` への一括INSERTを
 * 単一トランザクションで実行する。
 */
export function createCharacter(input: CharacterInput): Character {
  const db = getDb();
  const totalPoints = computeTotalPoints(input.parameters);

  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO characters (name, description, image_url, total_points) VALUES (?, ?, ?, ?)`
      )
      .run(input.name, input.description ?? null, input.imageUrl ?? null, totalPoints);
    const characterId = Number(result.lastInsertRowid);

    replaceParametersAndMoves(db, characterId, input);

    return findCharacterById(db, characterId);
  });

  const character = create();
  if (!character) {
    // INSERT直後の自己参照取得に失敗することは通常あり得ないが、型上 null を許容するため防御的に扱う。
    throw new Error("キャラクターの作成に失敗しました。");
  }
  return character;
}

/** キャラクター一覧を取得する(パラメータ・必殺技を含む全情報)。 */
export function listCharacters(): Character[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM characters ORDER BY id ASC`).all() as CharacterRow[];
  return rows.map((row) => assembleCharacter(db, row));
}

/** キャラクター詳細情報を一覧APIのサマリDTOへ変換する。 */
export function toCharacterSummary(character: Character): CharacterSummary {
  return {
    id: character.id,
    name: character.name,
    description: character.description,
    imageUrl: character.imageUrl,
    totalPoints: character.totalPoints,
    parameterCount: character.parameters.length,
    specialMoveCount: character.specialMoves.length,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

/** id指定でキャラクター1件を取得する。存在しない場合は `null` を返す。 */
export function getCharacterById(id: number): Character | null {
  const db = getDb();
  return findCharacterById(db, id);
}

/**
 * キャラクターを更新する。
 * `characters` の更新と `character_parameters` / `special_moves` の全削除→再挿入を
 * 単一トランザクションで実行する。対象キャラクターが存在しない場合は `null` を返す。
 */
export function updateCharacter(id: number, input: CharacterInput): Character | null {
  const db = getDb();
  const totalPoints = computeTotalPoints(input.parameters);

  const update = db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM characters WHERE id = ?`).get(id);
    if (!existing) {
      return null;
    }

    db.prepare(
      `UPDATE characters
       SET name = ?, description = ?, image_url = ?, total_points = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(input.name, input.description ?? null, input.imageUrl ?? null, totalPoints, id);

    replaceParametersAndMoves(db, id, input);

    return findCharacterById(db, id);
  });

  return update();
}

/**
 * キャラクターを削除する。
 * - 存在しない場合は `false` を返す(呼び出し元は404として扱う)。
 * - `deck_cards` に当該 `character_id` を参照する行が存在する場合、削除を行わず
 *   {@link CharacterInUseError} を投げる(呼び出し元は409として扱う)。
 * - 削除に成功した場合は `true` を返す。
 */
export function deleteCharacter(id: number): boolean {
  const db = getDb();

  const remove = db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM characters WHERE id = ?`).get(id);
    if (!existing) {
      return false;
    }

    const usedInDeck = db
      .prepare(`SELECT 1 FROM deck_cards WHERE character_id = ? LIMIT 1`)
      .get(id);
    if (usedInDeck) {
      throw new CharacterInUseError(id);
    }

    db.prepare(`DELETE FROM characters WHERE id = ?`).run(id);
    return true;
  });

  return remove();
}
