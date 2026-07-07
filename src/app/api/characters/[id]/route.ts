export const runtime = "nodejs";

/**
 * `GET /api/characters/:id` (詳細) / `PUT /api/characters/:id` (更新) /
 * `DELETE /api/characters/:id` (削除) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する。
 *
 * `GET` は所有者を問わず参照可能なままとする一方、`PUT`/`DELETE`(編集・削除)は
 * システムキャラクター(既存の403 `SYSTEM_CHARACTER_LOCKED`)を除き、ログイン中
 * ユーザーが作成したキャラクターのみ許可する(`ensureEditableCharacterOr404`)。
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
import { getCurrentUser } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

/** URLパスパラメータの `id` を正の整数として解釈する。不正な場合は `null` を返す。 */
function parseCharacterId(idParam: string): number | null {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PUT/DELETEの前に、対象がシステムキャラクターでない限り、ログイン中ユーザーが
 * その作成者であることを確認する(システムキャラクターは既存の
 * `SYSTEM_CHARACTER_LOCKED`(403)にそのまま処理を委ねるためここでは通す)。
 * `src/app/decks/[id]/edit/page.tsx` 用の `ensureOwnDeckOr404` と同じ方針の
 * IDOR対策。所有者が異なる場合は他ユーザーのキャラクターの存在有無を漏らさないよう
 * 404として扱う。
 */
async function ensureEditableCharacterOr404(id: number): Promise<NextResponse | null> {
  const [character, user] = await Promise.all([getCharacterById(id), getCurrentUser()]);
  if (!character) {
    return NextResponse.json({ error: "キャラクターが見つかりません。" }, { status: 404 });
  }
  if (!character.isSystem && (!user || character.userId !== user.id)) {
    return NextResponse.json({ error: "キャラクターが見つかりません。" }, { status: 404 });
  }
  return null;
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

  const forbidden = await ensureEditableCharacterOr404(id);
  if (forbidden) {
    return forbidden;
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

  const forbidden = await ensureEditableCharacterOr404(id);
  if (forbidden) {
    return forbidden;
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
