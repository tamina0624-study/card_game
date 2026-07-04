/**
 * デッキのCRUDリポジトリ層。
 *
 * `better-sqlite3` を直接使用し、`decks` / `deck_cards` の2テーブルへの読み書きを
 * `db.transaction()` でまとめて行う(docs/設計.md 2章参照)。
 *
 * - `characterId` が `characters` テーブルに実在するかどうかはDBアクセスが必要なため
 *   `lib/decks/validation.ts` では検証しておらず、このリポジトリ層(作成・更新時)で
 *   検証する。存在しない場合は {@link CharacterNotFoundError} を投げる
 *   (呼び出し元のAPI Route Handlerで400として扱う)。
 * - 作成・更新時は `deck_cards` を一旦全削除してから入力内容で再挿入する
 *   (キャラクターのパラメータ・必殺技の差し替え処理と同じ方針、
 *   `lib/characters/repository.ts` の `replaceParametersAndMoves` を参照)。
 * - `slot_order` は front/bench それぞれのグループ内でのインデックス(0始まり)とする。
 * - キャラクター詳細情報(パラメータ・必殺技を含む全情報)の組み立ては
 *   `lib/characters/repository.ts` の `getCharacterById` をそのまま再利用する
 *   (キャラクター側と同じくN+1クエリになるが、MVPの想定データ量では問題にならないと判断)。
 * - `deleteDeck` は `battles` に当該 `deck_id`(`deck_a_id`/`deck_b_id`)が存在する場合、
 *   {@link DeckInUseError} を投げて削除を拒否する(呼び出し元は409として扱う)。
 *   `battles` テーブルの `deck_a_id`/`deck_b_id` 外部キーには `ON DELETE CASCADE` が
 *   設定されていない(schema.sql参照)ため、対策なしに削除すると
 *   `foreign_keys = ON` 環境下ではSQLiteのFOREIGN KEY制約違反で失敗してしまう。
 */

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/client";
import { getCharacterById } from "@/lib/characters/repository";
import type { Character, Deck, DeckInput, DeckSummary } from "@/lib/types";

/** `decks` テーブルの行(スキーマの列名そのまま)。 */
type DeckRow = {
  id: number;
  name: string;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
};

/** `deck_cards` テーブルの行。 */
type DeckCardRow = {
  id: number;
  deck_id: number;
  character_id: number;
  role: "front" | "bench";
  slot_order: number;
};

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

/**
 * `cards` に含まれるすべての `characterId` が `characters` テーブルに存在することを
 * 確認する。存在しないものがあれば {@link CharacterNotFoundError} を投げる。
 */
function assertCharactersExist(db: Database.Database, characterIds: number[]): void {
  const existsStatement = db.prepare(`SELECT 1 FROM characters WHERE id = ?`);
  for (const characterId of characterIds) {
    const found = existsStatement.get(characterId);
    if (!found) {
      throw new CharacterNotFoundError(characterId);
    }
  }
}

/**
 * `deck_cards` へ入力内容を挿入する。`slot_order` は front/bench それぞれの
 * グループ内でのインデックス(0始まり、入力配列内での出現順)とする。
 */
function insertDeckCards(db: Database.Database, deckId: number, cards: DeckInput["cards"]): void {
  const insertCard = db.prepare(
    `INSERT INTO deck_cards (deck_id, character_id, role, slot_order) VALUES (?, ?, ?, ?)`
  );

  const frontCards = cards.filter((card) => card.role === "front");
  frontCards.forEach((card, index) => {
    insertCard.run(deckId, card.characterId, card.role, index);
  });

  const benchCards = cards.filter((card) => card.role === "bench");
  benchCards.forEach((card, index) => {
    insertCard.run(deckId, card.characterId, card.role, index);
  });
}

/**
 * `decks` 1行 + 関連する `deck_cards` からfront/bench各4体のキャラクター全情報を
 * 組み立てて `Deck` 型として返す。存在しない場合は `null` を返す。
 */
function findDeckById(db: Database.Database, id: number): Deck | null {
  const row = db.prepare(`SELECT * FROM decks WHERE id = ?`).get(id) as DeckRow | undefined;
  if (!row) {
    return null;
  }

  const cardRows = db
    .prepare(`SELECT * FROM deck_cards WHERE deck_id = ? ORDER BY role ASC, slot_order ASC, id ASC`)
    .all(id) as DeckCardRow[];

  const front: Character[] = [];
  const bench: Character[] = [];
  for (const cardRow of cardRows) {
    const character = getCharacterById(cardRow.character_id);
    if (!character) {
      // 通常、作成・更新時に assertCharactersExist で存在確認済みのため到達しない想定だが、
      // (デッキ作成後にキャラクターが削除される、等の)データ不整合に備えた防御的チェック。
      throw new Error(
        `デッキ(id=${id})が参照するキャラクター(id=${cardRow.character_id})が見つかりません。`
      );
    }
    if (cardRow.role === "front") {
      front.push(character);
    } else {
      bench.push(character);
    }
  }

  return {
    id: row.id,
    name: row.name,
    ownerName: row.owner_name,
    front,
    bench,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * デッキを新規作成する。
 * `cards` の各 `characterId` が `characters` テーブルに存在することを確認したうえで、
 * `decks` へのINSERTと `deck_cards` への一括INSERTを単一トランザクションで実行する。
 * 存在しない `characterId` があれば {@link CharacterNotFoundError} を投げる。
 */
export function createDeck(input: DeckInput): Deck {
  const db = getDb();

  const create = db.transaction(() => {
    assertCharactersExist(
      db,
      input.cards.map((card) => card.characterId)
    );

    const result = db
      .prepare(`INSERT INTO decks (name, owner_name) VALUES (?, ?)`)
      .run(input.name, input.ownerName ?? null);
    const deckId = Number(result.lastInsertRowid);

    insertDeckCards(db, deckId, input.cards);

    return findDeckById(db, deckId);
  });

  const deck = create();
  if (!deck) {
    // INSERT直後の自己参照取得に失敗することは通常あり得ないが、型上 null を許容するため防御的に扱う。
    throw new Error("デッキの作成に失敗しました。");
  }
  return deck;
}

/** デッキ一覧を取得する(概要情報のみ: id/name/ownerName/createdAt)。 */
export function listDecks(): DeckSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, name, owner_name, created_at FROM decks ORDER BY id ASC`)
    .all() as Array<Pick<DeckRow, "id" | "name" | "owner_name" | "created_at">>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerName: row.owner_name,
    createdAt: row.created_at,
  }));
}

/**
 * id指定でデッキ1件を取得する(front/bench各4体のキャラクター全情報を含む)。
 * 存在しない場合は `null` を返す。
 */
export function getDeckById(id: number): Deck | null {
  const db = getDb();
  return findDeckById(db, id);
}

/**
 * デッキを更新する。
 * 対象デッキが存在しない場合は `null` を返す。存在する場合、`cards` の各
 * `characterId` が `characters` テーブルに存在することを確認したうえで、
 * `decks` の更新と既存 `deck_cards` の全削除→再挿入を単一トランザクションで実行する。
 * 存在しない `characterId` があれば {@link CharacterNotFoundError} を投げる。
 */
export function updateDeck(id: number, input: DeckInput): Deck | null {
  const db = getDb();

  const update = db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM decks WHERE id = ?`).get(id);
    if (!existing) {
      return null;
    }

    assertCharactersExist(
      db,
      input.cards.map((card) => card.characterId)
    );

    db.prepare(
      `UPDATE decks SET name = ?, owner_name = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(input.name, input.ownerName ?? null, id);

    db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).run(id);
    insertDeckCards(db, id, input.cards);

    return findDeckById(db, id);
  });

  return update();
}

/**
 * デッキを削除する。
 * - 存在しない場合は `false` を返す(呼び出し元は404として扱う)。
 * - `battles` に当該 `deck_id` を参照する行(`deck_a_id`/`deck_b_id`)が存在する場合、
 *   削除を行わず {@link DeckInUseError} を投げる(呼び出し元は409として扱う)。
 * - 削除に成功した場合は `true` を返す(`deck_cards` は `ON DELETE CASCADE` で連動削除)。
 */
export function deleteDeck(id: number): boolean {
  const db = getDb();

  const remove = db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM decks WHERE id = ?`).get(id);
    if (!existing) {
      return false;
    }

    const usedInBattle = db
      .prepare(`SELECT 1 FROM battles WHERE deck_a_id = ? OR deck_b_id = ? LIMIT 1`)
      .get(id, id);
    if (usedInBattle) {
      throw new DeckInUseError(id);
    }

    db.prepare(`DELETE FROM decks WHERE id = ?`).run(id);
    return true;
  });

  return remove();
}
