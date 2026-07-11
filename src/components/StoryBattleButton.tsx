"use client";

/**
 * 「章内の戦闘ビートに挑む」ボタン(クライアントコンポーネント)。
 *
 * 対戦セットアップ(`BattleSetupForm`)と同じ戦闘ポップアップ(`BattlePopup`)を再利用し、
 * ページ遷移せずにその場で戦闘演出・結果を表示する。呼び出し元
 * (`src/app/stories/[id]/page.tsx`)からは自分の専用デッキ(`playerDeck`、常にチームA)と
 * 対戦相手デッキ(`enemyDeck`、常にチームB。ビートの`deckId`から取得済みのもの)を渡してもらう
 * (このコンポーネント自身はデッキ一覧の取得や選択を行わない、常に固定の2デッキで戦う)。
 *
 * `POST /api/stories/beats/:beatId/battle` を呼び出し、成功したら返却された`BattleDetail`を
 * そのままポップアップの結果表示に渡す(冪等ではないため、二重クリック防止に`loading`中は
 * ボタンを無効化する)。失敗時(デッキ未作成・ビートロック中・AI呼び出し失敗等)は
 * ポップアップを開かずその場にエラーを表示する。
 *
 * ポップアップを閉じたら`router.refresh()`でこのページのサーバーコンポーネント側データ
 * (`clearedAt`・対戦履歴・章内ロック状態等)を再取得する(`BattleSetupForm`の
 * `handleCloseResult`と同じ方針)。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import BattlePopup, { pickBattleBackground } from "@/components/BattlePopup";
import type { BattleDetail, Deck } from "@/lib/types";

export default function StoryBattleButton({
  beatId,
  label,
  playerDeck,
  enemyDeck,
}: {
  beatId: number;
  label: string;
  playerDeck: Deck;
  enemyDeck: Deck;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageBackground, setStageBackground] = useState<string | null>(null);
  const [battleResult, setBattleResult] = useState<BattleDetail | null>(null);

  const isPopupOpen = loading || battleResult !== null;

  async function handleClick() {
    setError(null);
    setLoading(true);
    setStageBackground(pickBattleBackground());
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
        setStageBackground(null);
        return;
      }

      setBattleResult(data as BattleDetail);
      setLoading(false);
    } catch {
      setError("通信エラーが発生しました。しばらくしてから再度お試しください。");
      setLoading(false);
      setStageBackground(null);
    }
  }

  function handleClosePopup() {
    setBattleResult(null);
    setStageBackground(null);
    router.refresh();
  }

  if (isPopupOpen && stageBackground) {
    return (
      <BattlePopup
        open
        deckAName={playerDeck.name}
        deckBName={enemyDeck.name}
        deckAFront={playerDeck.front}
        deckABench={playerDeck.bench}
        deckBFront={enemyDeck.front}
        deckBBench={enemyDeck.bench}
        battleResult={battleResult}
        stageBackground={stageBackground}
        onClose={handleClosePopup}
      />
    );
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
