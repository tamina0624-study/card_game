export const runtime = "nodejs";

/**
 * `POST /api/auth/recover` (パスワード問い合わせ)のRoute Handler。
 *
 * アプリが自動生成したパスワードをユーザーが忘れた場合に、ユーザー名だけで
 * 再確認できるようにする(追加機能20260707.md「アプリが適当に作ったパスワードなので
 * DBに平文で登録し、問い合わせに答えられるようにする」に対応)。
 */

import { NextRequest, NextResponse } from "next/server";
import { BridgeError } from "@/lib/bridge/client";
import { recoverPassword, UsernameNotFoundError } from "@/lib/auth/repository";

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
    const result = await recoverPassword(username.trim());
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof UsernameNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof BridgeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
