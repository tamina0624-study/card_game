export const runtime = "nodejs";

/**
 * `GET /api/stories` (公開済みストーリー章一覧)のRoute Handler。
 * ログイン中であれば各章の `playedAt`(プレイ済み日時)が付与される。
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listStoryChapters } from "@/lib/stories/repository";

export async function GET() {
  const user = await getCurrentUser();
  const chapters = await listStoryChapters(user?.id);
  return NextResponse.json(chapters, { status: 200 });
}
