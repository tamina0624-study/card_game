export const runtime = "nodejs";

/**
 * `GET /api/characters` (一覧) / `POST /api/characters` (作成) のRoute Handler。
 *
 * SQLite(`better-sqlite3`)を同期的に利用するため `runtime = "nodejs"` を明示する
 * (docs/設計.md 1.1「SQLiteアクセスを行うAPI Routeには runtime = "nodejs" を明示」)。
 */

import { NextRequest, NextResponse } from "next/server";
import { createCharacter, listCharacters, toCharacterSummary } from "@/lib/characters/repository";
import { validateCharacterInput } from "@/lib/characters/validation";
import type { CharacterSummary } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * キャラクター一覧をサマリDTOの配列で返す(所有者を問わず全件、絞り込み無し)。
 * デッキ編成のキャラクター選択(`DeckBuilder`)で使うため、`src/app/characters/page.tsx`
 * (自分のキャラクターのみ表示)とは異なりここではフィルタしない。
 */
export async function GET() {
  const characters = await listCharacters();
  const summaries: CharacterSummary[] = characters.map(toCharacterSummary);
  return NextResponse.json(summaries, { status: 200 });
}

/**
 * キャラクターを新規作成する。
 * `validateCharacterInput` による検証(100ポイント制限含む)に失敗した場合は400、
 * 成功した場合は `createCharacter` を呼び出し201で作成物(詳細情報)を返す。
 * ログイン中であれば、そのユーザーのidを紐付ける(`characters.user_id`)。
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

  const user = await getCurrentUser();
  const character = await createCharacter(result.data, user?.id);
  return NextResponse.json(character, { status: 201 });
}
