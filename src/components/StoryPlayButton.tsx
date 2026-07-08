"use client";

/**
 * 「物語を始める」ボタン(クライアントコンポーネント)。
 *
 * `POST /api/stories/beats/:beatId/play` を呼び出し、成功したら `router.refresh()` で
 * ページ(サーバーコンポーネント)を再描画して生成済みの本文を表示する
 * (`LogoutButton` と同じ「実行後にrefreshで再取得する」方針)。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StoryPlayButton({ beatId }: { beatId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/stories/beats/${beatId}/play`, { method: "POST" });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "物語の生成に失敗しました。";
        setError(message);
        return;
      }

      router.refresh();
    } catch {
      setError("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button button-primary" onClick={handleClick} disabled={loading}>
        {loading ? "物語を生成中..." : "物語を始める"}
      </button>
    </div>
  );
}
