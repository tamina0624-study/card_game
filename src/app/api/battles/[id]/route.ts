export const runtime = "nodejs";

/**
 * `GET /api/battles/:id` (対戦詳細取得) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する。
 */

import { NextRequest, NextResponse } from "next/server";
import { getBattleDetail } from "@/lib/battles/repository";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseBattleId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 対戦詳細(分析/戦闘ログ/イベント/結果一式)を取得する。存在しない場合は404。 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseBattleId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  const battle = await getBattleDetail(id);
  if (!battle) {
    return NextResponse.json({ error: "対戦が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json(battle, { status: 200 });
}
