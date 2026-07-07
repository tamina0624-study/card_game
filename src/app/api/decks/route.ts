export const runtime = "nodejs";

/**
 * `GET /api/decks` (一覧) / `POST /api/decks` (作成) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する
 * (docs/設計.md 1.1「SQLiteアクセスを行うAPI Routeには runtime = "nodejs" を明示」)。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CharacterNotFoundError, createDeck, listDecks } from "@/lib/decks/repository";
import { validateDeckInput } from "@/lib/decks/validation";

/** デッキ一覧を概要DTO(id/name/ownerName/createdAt)の配列で返す。 */
export async function GET() {
  const decks = await listDecks();
  return NextResponse.json(decks, { status: 200 });
}

/**
 * デッキを新規作成する。
 * `validateDeckInput` による検証(8枚ちょうど・前衛4/控え4・characterId重複禁止)に
 * 失敗した場合は400、`cards` が参照する `characterId` が存在しない場合も400、
 * 成功した場合は `createDeck` を呼び出し201で作成物(front/bench全情報)を返す。
 *
 * ログイン中であれば、そのユーザーのidを `createDeck` に渡し、作成したデッキを
 * そのユーザーの専用デッキ(`decks.user_id`)として自動的に紐付ける
 * (追加機能20260707「ユーザー専用のデッキ」対応)。未ログインの場合は従来通り
 * 誰にも紐付かない共有プールのデッキとして作成される。
 */
export async function POST(request: NextRequest) {
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

  try {
    const user = await getCurrentUser();
    const deck = await createDeck(result.data, user?.id);
    return NextResponse.json(deck, { status: 201 });
  } catch (error) {
    if (error instanceof CharacterNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
