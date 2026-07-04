/**
 * バトル(対戦)のリポジトリ層。
 *
 * `better-sqlite3` を直接使用し、`battles` / `battle_logs` / `battle_events` の
 * 3テーブルへの読み書きを行う(docs/設計.md 2章・3章参照)。
 *
 * `POST /api/battles`(`src/app/api/battles/route.ts`)からの想定利用フローは以下の通り:
 *   1. `createPendingBattle` で `status='pending'` の行を先に作成しidを確保する。
 *   2. 両デッキ詳細(`lib/decks/repository.ts` の `getDeckById`)を取得し、
 *      `lib/battles/prompt.ts` でプロンプトを構築、`lib/battles/parseResponse.ts` の
 *      `generateBattleWithRetry` でAI応答を取得・検証する。
 *   3. 検証に成功した場合は `saveBattleResult` で結果一式(分析・戦闘ログ・イベント・
 *      勝敗/MVP)を保存する(`status='completed'` に更新)。
 *   4. 失敗した場合は `markBattleFailed` で `status='failed'` とし理由を保存する。
 *   5. いずれの場合も `getBattleDetail` で最終的なレスポンス形状を取得して返す。
 */

import { getDb } from "@/lib/db/client";
import { getDeckById } from "@/lib/decks/repository";
import type { BattleAIResponse } from "@/lib/battles/responseSchema";
import type {
  BattleDetail,
  BattleEventDetail,
  BattleLogEntry,
  BattleStatus,
  BattleSummary,
} from "@/lib/types";

/** `battles` テーブルの行(スキーマの列名そのまま)。 */
type BattleRow = {
  id: number;
  deck_a_id: number;
  deck_b_id: number;
  status: BattleStatus;
  winner: "teamA" | "teamB" | null;
  mvp_character_id: number | null;
  mvp_name: string | null;
  analysis_team_a: string | null;
  analysis_team_b: string | null;
  predicted_winner: "teamA" | "teamB" | null;
  raw_ai_response: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

/** `battles` + 両デッキ名をJOINして取得した行(一覧・詳細取得の共通形)。 */
type BattleWithDeckNamesRow = BattleRow & {
  deck_a_name: string;
  deck_b_name: string;
};

/** `battle_logs` テーブルの行。 */
type BattleLogRow = {
  id: number;
  battle_id: number;
  turn: number;
  message: string;
  sort_order: number;
};

/** `battle_events` テーブルの行。 */
type BattleEventRow = {
  id: number;
  battle_id: number;
  turn: number | null;
  event_type: string | null;
  character_name: string | null;
  effect: string | null;
  raw_json: string;
  sort_order: number;
};

/** `battles` + 両デッキ名をJOINするSQL(一覧・詳細で共用)。 */
const SELECT_BATTLE_WITH_DECK_NAMES = `
  SELECT b.*, da.name AS deck_a_name, dbk.name AS deck_b_name
  FROM battles b
  JOIN decks da ON da.id = b.deck_a_id
  JOIN decks dbk ON dbk.id = b.deck_b_id
`;

/**
 * 新規バトルを `status='pending'` で作成し、そのidを返す。
 * `deckAId`/`deckBId` が `decks` テーブルに実在することは呼び出し元
 * (API Route Handler)で事前に検証済みであることを前提とする
 * (`battles.deck_a_id`/`deck_b_id` は外部キー制約のみで存在確認は行わない)。
 */
export function createPendingBattle(deckAId: number, deckBId: number): number {
  const db = getDb();
  const result = db
    .prepare(`INSERT INTO battles (deck_a_id, deck_b_id, status) VALUES (?, ?, 'pending')`)
    .run(deckAId, deckBId);
  return Number(result.lastInsertRowid);
}

/**
 * イベントオブジェクトから数値の `turn` 相当フィールド(`turn`キー)を取り出す。
 * 存在しない、または数値でない場合は `null` を返す
 * (docs/設計.md 1.4「`battle_events.turn` はAIの出力に数値の `turn` 相当フィールドが
 * あればそれを採用し、無ければ `NULL` とする」)。
 */
function extractEventTurn(event: Record<string, unknown>): number | null {
  const turn = event.turn;
  return typeof turn === "number" ? turn : null;
}

/**
 * 両デッキ(front/bench 全8体ずつ、計16体)のキャラクター名の中から、
 * `mvpName` と大文字小文字を無視して一致するキャラクターのidを解決する。
 * ヒットしない場合は `null` を返す(ベストエフォート解決、docs/設計.md 2章
 * `battles.mvp_character_id` のコメント参照)。
 */
function resolveMvpCharacterId(deckAId: number, deckBId: number, mvpName: string): number | null {
  const deckA = getDeckById(deckAId);
  const deckB = getDeckById(deckBId);
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
 *
 * 単一トランザクション内で以下をすべて実行する:
 * - `battles` の更新(`status='completed'`、分析・勝敗・MVP・生応答・完了日時)。
 *   `mvp_character_id` は両デッキの全キャラクター名と `parsed.result.mvp` を
 *   大小文字無視で突合し、ヒットすればそのid、無ければ `null` とする。
 * - `battle_logs` への一括挿入(`turn`/`message`/`sort_order`=配列index)。
 * - `battle_events` への一括挿入(`event_type`=`type`、`character_name`=`character`、
 *   `effect`=`effect`、`raw_json`=イベント全体、`turn`=数値`turn`フィールドがあれば
 *   その値・無ければ`null`、`sort_order`=配列index)。
 */
export function saveBattleResult(battleId: number, parsed: BattleAIResponse, rawText: string): void {
  const db = getDb();

  const save = db.transaction(() => {
    const battleRow = db
      .prepare(`SELECT deck_a_id, deck_b_id FROM battles WHERE id = ?`)
      .get(battleId) as Pick<BattleRow, "deck_a_id" | "deck_b_id"> | undefined;
    if (!battleRow) {
      throw new Error(`バトル(id=${battleId})が見つかりません。`);
    }

    const mvpCharacterId = resolveMvpCharacterId(
      battleRow.deck_a_id,
      battleRow.deck_b_id,
      parsed.result.mvp
    );

    db.prepare(
      `UPDATE battles
       SET status = 'completed',
           analysis_team_a = ?,
           analysis_team_b = ?,
           predicted_winner = ?,
           winner = ?,
           mvp_name = ?,
           mvp_character_id = ?,
           raw_ai_response = ?,
           completed_at = datetime('now')
       WHERE id = ?`
    ).run(
      parsed.analysis.teamA,
      parsed.analysis.teamB,
      parsed.analysis.predictedWinner,
      parsed.result.winner,
      parsed.result.mvp,
      mvpCharacterId,
      rawText,
      battleId
    );

    const insertLog = db.prepare(
      `INSERT INTO battle_logs (battle_id, turn, message, sort_order) VALUES (?, ?, ?, ?)`
    );
    parsed.battleLog.forEach((entry, index) => {
      insertLog.run(battleId, entry.turn, entry.message, index);
    });

    const insertEvent = db.prepare(
      `INSERT INTO battle_events (battle_id, turn, event_type, character_name, effect, raw_json, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    parsed.events.forEach((event, index) => {
      const character = (event.character ?? null) as string | null;
      const effect = (event.effect ?? null) as string | null;
      insertEvent.run(
        battleId,
        extractEventTurn(event),
        event.type,
        character,
        effect,
        JSON.stringify(event),
        index
      );
    });
  });

  save();
}

/** バトルを失敗として記録する(`status='failed'`、`error_message`に理由を保存)。 */
export function markBattleFailed(battleId: number, errorMessage: string): void {
  const db = getDb();
  db.prepare(`UPDATE battles SET status = 'failed', error_message = ? WHERE id = ?`).run(
    errorMessage,
    battleId
  );
}

/** `battle_logs`/`battle_events` の行をアプリ側の型に変換する。 */
function toBattleLogEntry(row: BattleLogRow): BattleLogEntry {
  return { turn: row.turn, message: row.message };
}

function toBattleEventDetail(row: BattleEventRow): BattleEventDetail {
  return {
    turn: row.turn,
    type: row.event_type,
    character: row.character_name,
    effect: row.effect,
    raw: JSON.parse(row.raw_json) as Record<string, unknown>,
  };
}

/** `battles`(+デッキ名) 1行を `BattleDetail` 形状(のうちバトル本体部分)へ変換する。 */
function toBattleDetailBase(row: BattleWithDeckNamesRow): Omit<BattleDetail, "battleLog" | "events"> {
  const analysis =
    row.analysis_team_a !== null && row.analysis_team_b !== null && row.predicted_winner !== null
      ? {
          teamA: row.analysis_team_a,
          teamB: row.analysis_team_b,
          predictedWinner: row.predicted_winner,
        }
      : null;

  const result =
    row.winner !== null && row.mvp_name !== null
      ? { winner: row.winner, mvpName: row.mvp_name, mvpCharacterId: row.mvp_character_id }
      : null;

  return {
    id: row.id,
    status: row.status,
    deckA: { id: row.deck_a_id, name: row.deck_a_name },
    deckB: { id: row.deck_b_id, name: row.deck_b_name },
    analysis,
    result,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

/**
 * id指定でバトル詳細(`docs/設計.md` 3章の `BattleDetail` 形状)を取得する。
 * `battles`+両デッキ名をJOINし、`battle_logs`/`battle_events` を
 * それぞれ `sort_order` 順に取得して組み立てる。存在しない場合は `null` を返す。
 */
export function getBattleDetail(id: number): BattleDetail | null {
  const db = getDb();

  const row = db
    .prepare(`${SELECT_BATTLE_WITH_DECK_NAMES} WHERE b.id = ?`)
    .get(id) as BattleWithDeckNamesRow | undefined;
  if (!row) {
    return null;
  }

  const logRows = db
    .prepare(`SELECT * FROM battle_logs WHERE battle_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(id) as BattleLogRow[];
  const eventRows = db
    .prepare(`SELECT * FROM battle_events WHERE battle_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(id) as BattleEventRow[];

  return {
    ...toBattleDetailBase(row),
    battleLog: logRows.map(toBattleLogEntry),
    events: eventRows.map(toBattleEventDetail),
  };
}

/** バトル履歴一覧を取得する(概要情報のみ)。 */
export function listBattles(): BattleSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`${SELECT_BATTLE_WITH_DECK_NAMES} ORDER BY b.id ASC`)
    .all() as BattleWithDeckNamesRow[];

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    deckA: { id: row.deck_a_id, name: row.deck_a_name },
    deckB: { id: row.deck_b_id, name: row.deck_b_name },
    winner: row.winner,
    mvpName: row.mvp_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}
