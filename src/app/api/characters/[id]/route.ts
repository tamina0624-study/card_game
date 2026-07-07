export const runtime = "nodejs";

/**
 * `GET /api/characters/:id` (詳細) / `PUT /api/characters/:id` (更新) /
 * `DELETE /api/characters/:id` (削除) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CharacterInUseError,
  SystemCharacterLockedError,
  deleteCharacter,
  getCharacterById,
  updateCharacter,
} from "@/lib/characters/repository";
import { validateCharacterInput } from "@/lib/characters/validation";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseCharacterId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** キャラクター詳細を取得する。存在しない場合は404。 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseCharacterId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  const character = await getCharacterById(id);
  if (!character) {
    return NextResponse.json({ error: "キャラクターが見つかりません。" }, { status: 404 });
  }

  return NextResponse.json(character, { status: 200 });
}

/**
 * キャラクターを更新する。
 * 検証(`validateCharacterInput`)に失敗した場合は400、対象が存在しない場合は404、
 * 成功した場合は200で更新後の詳細情報を返す。
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseCharacterId(idParam);
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

  const result = validateCharacterInput(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "入力内容に誤りがあります。",
        details: result.errors.issues,
      },
      { status: 400 }
    );
  }

  try {
    const character = await updateCharacter(id, result.data);
    if (!character) {
      return NextResponse.json({ error: "キャラクターが見つかりません。" }, { status: 404 });
    }

    return NextResponse.json(character, { status: 200 });
  } catch (error) {
    if (error instanceof SystemCharacterLockedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

/**
 * キャラクターを削除する。
 * 存在しない場合は404、いずれかのデッキで使用中(`deck_cards` に参照あり)の場合は409、
 * 成功した場合は204(本文なし)を返す。
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseCharacterId(idParam);
  if (id === null) {
    return NextResponse.json({ error: "idが不正です。" }, { status: 400 });
  }

  try {
    const deleted = await deleteCharacter(id);
    if (!deleted) {
      return NextResponse.json({ error: "キャラクターが見つかりません。" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CharacterInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SystemCharacterLockedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
