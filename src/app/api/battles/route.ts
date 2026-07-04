export const runtime = "nodejs";

/**
 * `GET /api/battles` (対戦履歴一覧) / `POST /api/battles` (対戦実行) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する。
 *
 * `POST` は同期的にClaude APIを呼び出す(docs/設計.md 0章-4「戦闘実行は同期API呼び出し
 * とする」)。フローは以下の通り:
 *   1. リクエストボディ(`deckAId`/`deckBId`)を検証し、両デッキが実在することを確認する。
 *   2. `createPendingBattle` で `status='pending'` の行を先に作成する。
 *   3. `lib/battles/prompt.ts` の `buildBattlePrompt` でプロンプトを構築し、
 *      `lib/battles/parseResponse.ts` の `generateBattleWithRetry` でAI応答を取得・検証する。
 *   4. 成功時は `saveBattleResult` で結果を保存し、201で `getBattleDetail` の結果を返す。
 *   5. 失敗時(JSON検証失敗・Claude API呼び出し自体の失敗を含む)は `markBattleFailed` で
 *      `status='failed'` とし、502で `{ errorMessage }` を返す(docs/設計.md 3章参照)。
 */

import { NextRequest, NextResponse } from "next/server";
import { getDeckById } from "@/lib/decks/repository";
import { buildBattlePrompt } from "@/lib/battles/prompt";
import { generateBattleWithRetry } from "@/lib/battles/parseResponse";
import {
  createPendingBattle,
  getBattleDetail,
  listBattles,
  markBattleFailed,
  saveBattleResult,
} from "@/lib/battles/repository";
import type { BattleInput } from "@/lib/types";

/** バトル履歴一覧を概要DTOの配列で返す。 */
export async function GET() {
  const battles = listBattles();
  return NextResponse.json(battles, { status: 200 });
}

/** リクエストボディから `deckAId`/`deckBId`(いずれも正の整数)を取り出す。不正な場合は `null`。 */
function parseBattleInput(body: unknown): BattleInput | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { deckAId, deckBId } = body as Record<string, unknown>;
  if (
    typeof deckAId !== "number" ||
    !Number.isInteger(deckAId) ||
    deckAId <= 0 ||
    typeof deckBId !== "number" ||
    !Number.isInteger(deckBId) ||
    deckBId <= 0
  ) {
    return null;
  }
  return { deckAId, deckBId };
}

/**
 * 対戦を実行する。
 * `deckAId`/`deckBId` が不正・存在しない場合は400、Claude API呼び出し
 * (JSON検証失敗含む)に失敗した場合は502(`{ errorMessage }`)、成功した場合は
 * 201で対戦詳細(`BattleDetail`)を返す。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です。" },
      { status: 400 }
    );
  }

  const input = parseBattleInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "deckAId・deckBIdはいずれも正の整数で指定してください。" },
      { status: 400 }
    );
  }

  const deckA = getDeckById(input.deckAId);
  if (!deckA) {
    return NextResponse.json(
      { error: `デッキ(id=${input.deckAId})が見つかりません。` },
      { status: 400 }
    );
  }
  const deckB = getDeckById(input.deckBId);
  if (!deckB) {
    return NextResponse.json(
      { error: `デッキ(id=${input.deckBId})が見つかりません。` },
      { status: 400 }
    );
  }

  const battleId = createPendingBattle(input.deckAId, input.deckBId);

  try {
    const prompt = buildBattlePrompt(deckA, deckB);
    const { data, rawText } = await generateBattleWithRetry(prompt);
    saveBattleResult(battleId, data, rawText);
    return NextResponse.json(getBattleDetail(battleId), { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    markBattleFailed(battleId, errorMessage);
    return NextResponse.json({ errorMessage }, { status: 502 });
  }
}
