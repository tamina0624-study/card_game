export const runtime = "nodejs";

/** `POST /api/auth/logout` (ログアウト)のRoute Handler。 */

import { NextResponse } from "next/server";
import { logoutUser } from "@/lib/auth/repository";
import { clearSessionCookie, getSessionToken } from "@/lib/auth/session";

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    await logoutUser(token);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
