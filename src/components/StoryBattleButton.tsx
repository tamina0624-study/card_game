"use client";

/**
 * 「章内の戦闘ビートに挑む」ボタン(クライアントコンポーネント)。
 * `StoryPlayButton`と同じ「実行後にrefreshで再取得する」方針だが、こちらは
 * 結果を章詳細ページ内に表示するのではなく、既存の戦闘結果画面
 * (`/battles/[id]`、`BattleStage`/`BattleLogViewer`をそのまま再利用)へ遷移させる
 * (追加機能20260708.md対応、新規の戦闘演出UIは作らずスコープを抑える)。
 *
 * `POST /api/stories/beats/:beatId/battle` を呼び出し、成功したら `/battles/:battleId` へ
 * 遷移する。失敗時(デッキ未作成・ビートロック中・AI呼び出し失敗等)はその場にエラーを表示する。
 * ボタンのラベルはそのビートの`title`(例:「雑魚戦」「ボス戦: 山の主」)を呼び出し元から渡す。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StoryBattleButton({ beatId, label }: { beatId: number; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/stories/beats/${beatId}/battle`, { method: "POST" });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const message =
          (record && typeof record.errorMessage === "string" && record.errorMessage) ||
          (record && typeof record.error === "string" && record.error) ||
          "戦闘の実行に失敗しました。";
        setError(message);
        setLoading(false);
        return;
      }

      const battle = data as { id: number };
      router.push(`/battles/${battle.id}`);
    } catch {
      setError("通信エラーが発生しました。しばらくしてから再度お試しください。");
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
        {loading ? `${label}を実行中...` : `${label}に挑む`}
      </button>
    </div>
  );
}
