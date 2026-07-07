export const runtime = "nodejs";

/**
 * `GET /api/stories/:id` (ストーリー章詳細)のRoute Handler。
 * ログイン中であれば、その章に対する自分のプレイ内容(`play`)も含めて返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getStoryChapter } from "@/lib/stories/repository";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseChapterId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseChapterId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const chapter = await getStoryChapter(id, user?.id);
  if (!chapter) {
    return NextResponse.json({ error: "ストーリーが見つかりません。" }, { status: 404 });
  }

  return NextResponse.json(chapter, { status: 200 });
}
