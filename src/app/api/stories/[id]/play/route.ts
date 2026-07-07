export const runtime = "nodejs";

/**
 * `POST /api/stories/:id/play` (ストーリーを進める)のRoute Handler。
 *
 * ログインが必要(未ログインは401)。既にAI生成済みの本文がある場合は
 * そのまま返す(冪等、振り返り時に内容が変わらないようにするため再生成はしない)。
 * 未生成の場合のみ、ログインユーザーの専用デッキ(`lib/decks/repository.ts` の
 * `getUserDeck`)を取得し(無ければ400、`/decks/new`で先に作成してもらう)、
 * 章の大枠(`outline`)・ユーザー名・デッキの仲間キャラクター一覧から
 * `lib/stories/generate.ts` でAIに個別化ストーリー本文を生成させる
 * (追加機能20260707「デッキのメンバーで誰が登場するかはAIにお任せ」対応)。
 * 生成結果は `lib/stories/repository.ts` の `saveStoryPlay` で保存する。
 *
 * AI呼び出しに失敗した場合は502(`docs/設計.md` 3章のバトル実行APIと同じ方針)。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserDeck } from "@/lib/decks/repository";
import { generateStoryContent } from "@/lib/stories/generate";
import { getStoryChapter, saveStoryPlay } from "@/lib/stories/repository";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseChapterId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseChapterId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ストーリーを進めるにはログインが必要です。" }, { status: 401 });
  }

  const chapter = await getStoryChapter(id, user.id);
  if (!chapter) {
    return NextResponse.json({ error: "ストーリーが見つかりません。" }, { status: 404 });
  }

  if (chapter.play) {
    return NextResponse.json(chapter.play, { status: 200 });
  }

  const deck = await getUserDeck(user.id);
  if (!deck) {
    return NextResponse.json(
      { error: "ストーリーを進めるには先に自分専用のデッキを作成してください。", code: "NO_DECK" },
      { status: 400 }
    );
  }

  const roster = [...deck.front, ...deck.bench].map((character) => ({
    name: character.name,
    description: character.description,
  }));

  try {
    const { content, rawText } = await generateStoryContent(
      chapter.title,
      chapter.outline,
      user.username,
      deck.name,
      roster
    );
    const play = await saveStoryPlay(user.id, id, content, rawText);
    return NextResponse.json(play, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `物語の生成に失敗しました: ${errorMessage}` },
      { status: 502 }
    );
  }
}
