export const runtime = "nodejs";

/**
 * `GET /api/decks/:id` (詳細) / `PUT /api/decks/:id` (更新) /
 * `DELETE /api/decks/:id` (削除) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する。
 *
 * `GET` は対戦相手デッキ選択(`BattleSetupForm`)からも呼ばれるため所有者を問わず
 * 参照可能なままとする一方、`PUT`/`DELETE`(編集・削除)はログイン中ユーザーが
 * 作成したデッキのみ許可する(`ensureOwnDeckOr404`)。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CharacterNotFoundError,
  DeckInUseError,
  deleteDeck,
  getDeckById,
  updateDeck,
} from "@/lib/decks/repository";
import { validateDeckInput } from "@/lib/decks/validation";
import { getCurrentUser } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseDeckId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PUT/DELETEの前に、ログイン中ユーザーが対象デッキの作成者であることを確認する。
 * `src/app/decks/[id]/edit/page.tsx` の画面上のガードと対になる、APIを直接叩く経路
 * (IDOR)への対策。対象が存在しない・未ログイン・所有者が異なる場合はいずれも
 * 「見つからない」404として扱い、他ユーザーのデッキの存在有無を漏らさない。
 */
async function ensureOwnDeckOr404(id: number): Promise<NextResponse | null> {
  const [deck, user] = await Promise.all([getDeckById(id), getCurrentUser()]);
  if (!deck || !user || deck.userId !== user.id) {
    return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });
  }
  return null;
}

/** デッキ詳細(front/bench各4体のキャラクター全情報)を取得する。存在しない場合は404。 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseDeckId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  const deck = await getDeckById(id);
  if (!deck) {
    return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });
  }

  return NextResponse.json(deck, { status: 200 });
}

/**
 * デッキを更新する。
 * 検証(`validateDeckInput`)に失敗した場合は400、`cards` が参照する `characterId` が
 * 存在しない場合も400、対象デッキが存在しない場合は404、成功した場合は200で
 * 更新後の詳細情報を返す。
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseDeckId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です。" },
      { status: 400 }
    );
  }

  const result = validateDeckInput(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "入力内容に誤りがあります。",
        details: result.errors.issues,
      },
      { status: 400 }
    );
  }

  const forbidden = await ensureOwnDeckOr404(id);
  if (forbidden) {
    return forbidden;
  }

  try {
    const deck = await updateDeck(id, result.data);
    if (!deck) {
      return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });
    }
    return NextResponse.json(deck, { status: 200 });
  } catch (error) {
    if (error instanceof CharacterNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

/**
 * デッキを削除する。
 * 存在しない場合は404、いずれかの対戦で使用中(`battles` に参照あり)の場合は409、
 * 成功した場合は204(本文なし)を返す。
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseDeckId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  const forbidden = await ensureOwnDeckOr404(id);
  if (forbidden) {
    return forbidden;
  }

  try {
    const deleted = await deleteDeck(id);
    if (!deleted) {
      return NextResponse.json({ error: "デッキが見つかりません。" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DeckInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
