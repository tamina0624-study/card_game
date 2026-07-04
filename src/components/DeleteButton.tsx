"use client";

/**
 * 一覧画面(キャラクター/デッキ)共通の削除ボタン(クライアントコンポーネント)。
 *
 * クリック時に `window.confirm` で確認したうえで `DELETE {endpoint}` を送信する。
 * 成功(204)時は `router.refresh()` でサーバーコンポーネントの一覧データを
 * 再取得させる(ページ遷移はしない)。使用中(409、`CharacterInUseError`/
 * `DeckInUseError`)や未存在(404)の場合はAPIが返す `error` メッセージを
 * `window.alert` で表示し、一覧はそのまま(削除されずに残る)にする。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeleteButtonProps = {
  endpoint: string;
  confirmMessage: string;
};

export default function DeleteButton({ endpoint, confirmMessage }: DeleteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "削除に失敗しました。";
        window.alert(message);
        return;
      }
      router.refresh();
    } catch {
      window.alert("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className="button button-secondary card-actions__delete"
      onClick={handleDelete}
      disabled={deleting}
    >
      {deleting ? "削除中..." : "削除"}
    </button>
  );
}
