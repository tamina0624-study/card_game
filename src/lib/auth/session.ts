/**
 * ログインセッションのCookie管理。
 *
 * セッショントークン自体は不透明な値(PHP側 `user_sessions.token`)であり、
 * ここではhttpOnly Cookieとして読み書きするのみで、「誰か」の解決は
 * `lib/auth/repository.ts` の `getUserByToken` にPHPブリッジ経由で問い合わせる
 * (Next.js側でトークンの中身を検証・デコードすることはしない)。
 *
 * Cookieの書き込み(`set`/`clear`)はRoute Handler・Server Actionからのみ呼び出せる
 * (Next.jsの制約)。Server Component(ページ・Nav等)からは `getCurrentUser`/
 * `getSessionToken` の読み取りのみ利用すること。
 */

import { cookies } from "next/headers";
import { getUserByToken } from "@/lib/auth/repository";
import type { User } from "@/lib/types";

export const SESSION_COOKIE_NAME = "session_token";

/** PHP側 `user_sessions` のセッション有効期限(30日)と合わせる。 */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** ログイン成功時にセッショントークンをhttpOnly Cookieとして保存する。 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** ログアウト時にセッションCookieを削除する。 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** 現在のリクエストのセッショントークンを取得する。未ログインの場合は `null`。 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * 現在ログイン中のユーザーを取得する。未ログイン・トークン無効/期限切れの場合は `null`。
 * ページ(Server Component)・API Route Handlerの両方から呼び出せる。
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = await getSessionToken();
  if (!token) {
    return null;
  }
  return getUserByToken(token);
}
