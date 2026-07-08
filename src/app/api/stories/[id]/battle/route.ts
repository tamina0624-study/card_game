export const runtime = "nodejs";

/**
 * `POST /api/stories/:id/battle` (章内の雑魚戦・ボス戦を実行する)のRoute Handler。
 * 追加機能20260708.md「ストーリーモードに戦闘を組み込みたい」対応。
 *
 * リクエストボディ `{ phase: "mob" | "boss" }` に応じて、章に登録された
 * `mobDeckId`/`bossDeckId`(`stories.php` action=create-chapterで管理者が設定)を
 * 対戦相手として、`POST /api/battles`(`src/app/api/battles/route.ts`)と同じAI審判の
 * バトル基盤(`lib/battles/prompt.ts`・`lib/battles/parseResponse.ts`)をそのまま再利用して
 * 対戦を実行する。ユーザー自身のデッキ(`getUserDeck`)は常にチームA固定とする。
 *
 * 章のロック判定(`chapter.locked`、前章クリア判定)・対応するフェーズの敵デッキ未設定・
 * 専用デッキ未作成は、いずれも`/api/stories/:id/play`と同じ方針でエラーを返す
 * (401/403/400/404、`code`で種別を判別可能にする)。
 *
 * マスコットキャラクターの祝福(`lib/stories/blessing.ts`)は、対戦実行前に
 * 現在の挑戦回数(`getStoryBlessing`)から倍率を求め、`buildBattlePrompt`の
 * `blessingMultiplier`としてチームA(自分のデッキ)のパラメータにのみ反映する
 * (DBへは書き戻さない一時的な補正)。
 *
 * 対戦がAI応答検証まで含めて完了した場合(勝敗を問わない)のみ、挑戦回数を
 * `incrementStoryBlessing`で+1する(通信・AI応答エラーで対戦自体が成立しなかった
 * 場合はカウントしない)。`phase === "boss"`かつ自分の勝利だった場合のみ
 * `markChapterCleared`で章をクリア扱いにし、次章のロックを解除する。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCharacterById } from "@/lib/characters/repository";
import { getDeckById, getUserDeck } from "@/lib/decks/repository";
import { buildBattlePrompt } from "@/lib/battles/prompt";
import { generateBattleWithRetry } from "@/lib/battles/parseResponse";
import {
  createPendingBattle,
  getBattleDetail,
  markBattleFailed,
  saveBattleResult,
} from "@/lib/battles/repository";
import { blessingMultiplier } from "@/lib/stories/blessing";
import {
  getStoryBlessing,
  getStoryChapter,
  incrementStoryBlessing,
  markChapterCleared,
} from "@/lib/stories/repository";
import type { BattleStoryPhase } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseChapterId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** リクエストボディから `phase`("mob" | "boss")を取り出す。不正な場合は `null`。 */
function parsePhase(body: unknown): BattleStoryPhase | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { phase } = body as Record<string, unknown>;
  return phase === "mob" || phase === "boss" ? phase : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseChapterId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして不正です。" }, { status: 400 });
  }
  const phase = parsePhase(body);
  if (!phase) {
    return NextResponse.json({ error: 'phaseは"mob"または"boss"を指定してください。' }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "戦闘に挑むにはログインが必要です。" }, { status: 401 });
  }

  const chapter = await getStoryChapter(id, user.id);
  if (!chapter) {
    return NextResponse.json({ error: "ストーリーが見つかりません。" }, { status: 404 });
  }
  if (chapter.locked) {
    return NextResponse.json(
      { error: "前の章をクリアすると挑戦できます。", code: "CHAPTER_LOCKED" },
      { status: 403 }
    );
  }

  const enemyDeckId = phase === "mob" ? chapter.mobDeckId : chapter.bossDeckId;
  if (enemyDeckId === null) {
    return NextResponse.json(
      { error: "この章にはその戦闘は設定されていません。", code: "NO_BATTLE_FOR_PHASE" },
      { status: 400 }
    );
  }

  const myDeck = await getUserDeck(user.id);
  if (!myDeck) {
    return NextResponse.json(
      { error: "戦闘に挑むには先に自分専用のデッキを作成してください。", code: "NO_DECK" },
      { status: 400 }
    );
  }

  const enemyDeck = await getDeckById(enemyDeckId);
  if (!enemyDeck) {
    return NextResponse.json(
      { error: "対戦相手のデッキが見つかりません。管理者に連絡してください。" },
      { status: 500 }
    );
  }

  const blessing = await getStoryBlessing(user.id, id);
  const multiplier = blessingMultiplier(blessing.battleCount);
  const mascot = chapter.mascotCharacterId !== null ? await getCharacterById(chapter.mascotCharacterId) : null;

  const battleId = await createPendingBattle(myDeck.id, enemyDeck.id, { chapterId: id, phase });

  try {
    const prompt = buildBattlePrompt(myDeck, enemyDeck, {
      blessingMultiplier: multiplier,
      mascotName: mascot?.name,
    });
    const { data, rawText } = await generateBattleWithRetry(prompt);
    await saveBattleResult(battleId, data, rawText);

    // 対戦が成立した(勝敗が付いた)場合のみ挑戦回数を加算する。自分のデッキは常に
    // チームA固定のため、勝利判定は `data.result.winner === "teamA"` で行える。
    await incrementStoryBlessing(user.id, id);
    if (phase === "boss" && data.result.winner === "teamA") {
      await markChapterCleared(user.id, id);
    }

    return NextResponse.json(await getBattleDetail(battleId), { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markBattleFailed(battleId, errorMessage);
    return NextResponse.json({ errorMessage }, { status: 502 });
  }
}
