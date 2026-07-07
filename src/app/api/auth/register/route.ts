export const runtime = "nodejs";

/**
 * `POST /api/auth/register` (ユーザー登録)のRoute Handler。
 *
 * パスワードはユーザーが選ぶのではなく、PHPブリッジ側(`generate_random_password`)が
 * ランダムな10文字英数字で生成する(追加機能20260707.md「ユーザー登録機能」)。
 * 成功時はそのままログイン状態にする(セッションCookieを発行)うえで、
 * `{ user, password }` を返す(生成されたパスワードはこの応答でのみ表示され、
 * 以後は `POST /api/auth/recover` で本人が再確認する)。
 */

import { NextRequest, NextResponse } from "next/server";
import { BridgeError } from "@/lib/bridge/client";
import { registerUser, UsernameTakenError } from "@/lib/auth/repository";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして不正です。" }, { status: 400 });
  }

  const username =
    typeof body === "object" && body !== null && "username" in body
      ? (body as { username: unknown }).username
      : null;

  if (typeof username !== "string" || username.trim().length === 0) {
    return NextResponse.json({ error: "ユーザー名を入力してください。" }, { status: 400 });
  }

  try {
    const result = await registerUser(username.trim());
    await setSessionCookie(result.token);
    return NextResponse.json({ user: result.user, password: result.password }, { status: 201 });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BridgeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
