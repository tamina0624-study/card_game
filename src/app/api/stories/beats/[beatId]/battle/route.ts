export const runtime = "nodejs";

/**
 * `POST /api/stories/beats/:beatId/battle` (章内の戦闘ビートに挑む)のRoute Handler。
 *
 * `beatId`に紐付く戦闘ビート(`beatType==="battle"`)の`deckId`(管理者が
 * `stories.php` の`action=create-chapter`/`add-beat`/`update-beat`で設定)を対戦相手として、
 * `POST /api/battles`(`src/app/api/battles/route.ts`)と同じAI審判のバトル基盤
 * (`lib/battles/prompt.ts`・`lib/battles/parseResponse.ts`)をそのまま再利用して対戦を実行する。
 * ユーザー自身のデッキ(`getUserDeck`)は常にチームA固定とする。
 *
 * ビートのロック判定(章自体のロック・章内で直前のビートが未完了)は403
 * (`code: "BEAT_LOCKED"`)、対戦相手デッキが未設定(管理者がまだ`deckId`を設定していない
 * =準備中)の場合は400(`code: "NO_BATTLE_FOR_BEAT"`)、専用デッキ未作成は400
 * (`code: "NO_DECK"`)を返す。
 *
 * マスコットキャラクターの祝福(`lib/stories/blessing.ts`)は、対戦実行前に現在の挑戦回数
 * (章単位、`getStoryBlessing`)から倍率を求め、`buildBattlePrompt`の`blessingMultiplier`として
 * チームA(自分のデッキ)のパラメータにのみ反映する(DBへは書き戻さない一時的な補正)。
 *
 * 対戦がAI応答検証まで含めて完了した場合(勝敗を問わない)のみ、挑戦回数を
 * `incrementStoryBlessing`で+1する(通信・AI応答エラーで対戦自体が成立しなかった場合は
 * カウントしない)。全ての戦闘ビートは勝利が次のビート・次章への進行条件のため、
 * 自分が勝利した場合のみ`markBeatCleared`でこのビートを完了扱いにする。
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
import { getStoryBeat, getStoryBlessing, incrementStoryBlessing, markBeatCleared } from "@/lib/stories/repository";

type RouteContext = { params: Promise<{ beatId: string }> };

/** URLパスパラメータの `beatId` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseBeatId(beatIdParam: string): number | null {
  if (!/^\d+$/.test(beatIdParam)) {
    return null;
  }
  const id = Number(beatIdParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { beatId: beatIdParam } = await context.params;
  const beatId = parseBeatId(beatIdParam);
  if (beatId === null) {
    return NextResponse.json({ error: "beatIdが不正です。" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "戦闘に挑むにはログインが必要です。" }, { status: 401 });
  }

  const beat = await getStoryBeat(beatId, user.id);
  if (!beat) {
    return NextResponse.json({ error: "戦闘イベントが見つかりません。" }, { status: 404 });
  }
  if (beat.beatType !== "battle") {
    return NextResponse.json(
      { error: "このビートは戦闘イベントではありません。", code: "NOT_A_BATTLE_BEAT" },
      { status: 400 }
    );
  }
  if (beat.locked) {
    return NextResponse.json(
      { error: "前のストーリー・戦闘をクリアすると挑戦できます。", code: "BEAT_LOCKED" },
      { status: 403 }
    );
  }
  if (beat.deckId === null) {
    return NextResponse.json(
      { error: "この戦闘イベントはまだ準備中です。", code: "NO_BATTLE_FOR_BEAT" },
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

  const enemyDeck = await getDeckById(beat.deckId);
  if (!enemyDeck) {
    return NextResponse.json(
      { error: "対戦相手のデッキが見つかりません。管理者に連絡してください。" },
      { status: 500 }
    );
  }

  const blessing = await getStoryBlessing(user.id, beat.chapterId);
  const multiplier = blessingMultiplier(blessing.battleCount);
  const mascot = beat.mascotCharacterId !== null ? await getCharacterById(beat.mascotCharacterId) : null;

  const battleId = await createPendingBattle(myDeck.id, enemyDeck.id, beat.id);

  try {
    const prompt = buildBattlePrompt(myDeck, enemyDeck, {
      blessingMultiplier: multiplier,
      mascotName: mascot?.name,
    });
    const { data, rawText } = await generateBattleWithRetry(prompt);
    await saveBattleResult(battleId, data, rawText);

    // 対戦が成立した(勝敗が付いた)場合のみ挑戦回数を加算する。自分のデッキは常に
    // チームA固定のため、勝利判定は `data.result.winner === "teamA"` で行える。
    await incrementStoryBlessing(user.id, beat.chapterId);
    if (data.result.winner === "teamA") {
      await markBeatCleared(user.id, beatId);
    }

    return NextResponse.json(await getBattleDetail(battleId), { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markBattleFailed(battleId, errorMessage);
    return NextResponse.json({ errorMessage }, { status: 502 });
  }
}
