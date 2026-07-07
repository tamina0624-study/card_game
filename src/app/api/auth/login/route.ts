export const runtime = "nodejs";

/**
 * `POST /api/auth/login` (ログイン)のRoute Handler。
 * ユーザー名・パスワードが一致した場合のみセッションCookieを発行する。
 */

import { NextRequest, NextResponse } from "next/server";
import { BridgeError } from "@/lib/bridge/client";
import { InvalidCredentialsError, loginUser } from "@/lib/auth/repository";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして不正です。" }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const username = record?.username;
  const password = record?.password;

  if (typeof username !== "string" || username.trim().length === 0 || typeof password !== "string") {
    return NextResponse.json({ error: "ユーザー名とパスワードを入力してください。" }, { status: 400 });
  }

  try {
    const result = await loginUser(username.trim(), password);
    await setSessionCookie(result.token);
    return NextResponse.json({ user: result.user }, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof BridgeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
