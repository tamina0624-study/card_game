export const runtime = "nodejs";

/** `GET /api/auth/me` (現在ログイン中のユーザー取得)のRoute Handler。未ログインの場合は `{ user: null }`。 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
