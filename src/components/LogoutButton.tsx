"use client";

/**
 * ログアウトボタン(クライアントコンポーネント)。
 * `Nav`(サーバーコンポーネント)からログイン中のみ表示される。
 * `POST /api/auth/logout` 実行後、`router.refresh()` でサーバーコンポーネントを
 * 再描画し、Nav・各ページのログイン状態表示を更新する。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      className="button button-secondary site-header__logout"
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {loggingOut ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
