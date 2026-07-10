export const runtime = "nodejs";

/**
 * `POST /api/stories/beats/:beatId/play` (ストーリービートを進める)のRoute Handler。
 *
 * ログインが必要(未ログインは401)。ビートが存在しない場合は404、`beatType`が
 * `"story"`以外(戦闘ビート)を指定された場合は400。ロック中のビート
 * (章自体がロック中、または章内で直前のビートが未完了)は403(`code: "BEAT_LOCKED"`)を
 * 返す(URL直打ちでの先読み防止)。既にAI生成済みの本文がある場合はそのまま返す
 * (冪等、振り返り時に内容が変わらないようにするため再生成はしない)。
 * 未生成の場合のみ、ログインユーザーの専用デッキ(`lib/decks/repository.ts`の
 * `getUserDeck`)を取得し(無ければ400)、ビートのタイトル・あらすじ(`outline`)・
 * ユーザー名から`lib/stories/generate.ts`でAIに個別化ストーリー本文を生成させる。
 * 生成結果は`lib/stories/repository.ts`の`playStoryBeat`で保存する
 * (保存と同時にそのビートは完了扱いになる)。
 *
 * AI呼び出しに失敗した場合は502(`docs/設計.md` 3章のバトル実行APIと同じ方針)。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserDeck } from "@/lib/decks/repository";
import { generateStoryContent } from "@/lib/stories/generate";
import { getStoryBeat, playStoryBeat } from "@/lib/stories/repository";

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
    return NextResponse.json({ error: "ストーリーを進めるにはログインが必要です。" }, { status: 401 });
  }

  const beat = await getStoryBeat(beatId, user.id);
  if (!beat) {
    return NextResponse.json({ error: "ストーリーが見つかりません。" }, { status: 404 });
  }
  if (beat.beatType !== "story") {
    return NextResponse.json(
      { error: "このビートはストーリーではありません。", code: "NOT_A_STORY_BEAT" },
      { status: 400 }
    );
  }
  if (beat.locked) {
    return NextResponse.json(
      { error: "前のストーリー・戦闘をクリアすると進められます。", code: "BEAT_LOCKED" },
      { status: 403 }
    );
  }

  if (beat.content !== null) {
    return NextResponse.json(
      { beatId: beat.id, content: beat.content, createdAt: beat.createdAt, clearedAt: beat.clearedAt },
      { status: 200 }
    );
  }

  const deck = await getUserDeck(user.id);
  if (!deck) {
    return NextResponse.json(
      { error: "ストーリーを進めるには先に自分専用のデッキを作成してください。", code: "NO_DECK" },
      { status: 400 }
    );
  }

  try {
    const { content, rawText } = await generateStoryContent(beat.title, beat.outline ?? "", user.username);
    const progress = await playStoryBeat(user.id, beatId, content, rawText);
    return NextResponse.json(progress, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `物語の生成に失敗しました: ${errorMessage}` },
      { status: 502 }
    );
  }
}
