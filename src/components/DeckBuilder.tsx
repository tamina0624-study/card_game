"use client";

/**
 * デッキ編成用のキャラクター選択UI。
 *
 * `GET /api/characters` でキャラクター一覧を取得し、チェックボックスで選択できる
 * リストとして表示する。ユーザーはちょうど {@link DECK_SIZE} 体を選択でき
 * (それ以上はチェックボックスを`disabled`にして選択不可にする)、選択済みの
 * 各キャラクターについて前衛('front')/控え('bench')を切り替えるトグルボタンを提供する。
 *
 * `PointAllocator`/`SpecialMoveEditor` と同じ「完全制御コンポーネント」の方針を踏襲し、
 * 選択状態そのもの(`cards: DeckCardInput[]`)は親(`src/app/decks/new/page.tsx`)が
 * 保持する。このコンポーネント自身はキャラクター一覧の取得(読み込み中・エラー状態含む)
 * のみを内部stateとして持つ。
 */

import { useEffect, useState } from "react";
import { DECK_SIZE, FRONT_SIZE, BENCH_SIZE } from "@/lib/decks/validation";
import type { CharacterSummary, DeckCardInput } from "@/lib/types";

export { DECK_SIZE, FRONT_SIZE, BENCH_SIZE };

type DeckBuilderProps = {
  cards: DeckCardInput[];
  onChange: (cards: DeckCardInput[]) => void;
};

export default function DeckBuilder({ cards, onChange }: DeckBuilderProps) {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/characters", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("キャラクター一覧の取得に失敗しました。");
        }
        const data = (await response.json()) as CharacterSummary[];
        if (!cancelled) {
          setCharacters(data);
        }
      } catch {
        if (!cancelled) {
          setLoadError("キャラクター一覧の取得に失敗しました。しばらくしてから再度お試しください。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCharacters();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCount = cards.length;
  const frontCount = cards.filter((card) => card.role === "front").length;
  const benchCount = cards.filter((card) => card.role === "bench").length;

  function findCard(characterId: number): DeckCardInput | undefined {
    return cards.find((card) => card.characterId === characterId);
  }

  function handleToggleSelect(characterId: number, checked: boolean) {
    if (checked) {
      if (selectedCount >= DECK_SIZE) {
        return;
      }
      const defaultRole: "front" | "bench" = frontCount < FRONT_SIZE ? "front" : "bench";
      onChange([...cards, { characterId, role: defaultRole }]);
    } else {
      onChange(cards.filter((card) => card.characterId !== characterId));
    }
  }

  function handleRoleChange(characterId: number, role: "front" | "bench") {
    onChange(cards.map((card) => (card.characterId === characterId ? { ...card, role } : card)));
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>キャラクター一覧を読み込み中...</p>;
  }

  if (loadError) {
    return (
      <p className="form-error" role="alert">
        {loadError}
      </p>
    );
  }

  if (characters.length === 0) {
    return (
      <p style={{ color: "var(--muted)" }}>
        キャラクターが登録されていません。先に「キャラクター作成」から作成してください。
      </p>
    );
  }

  return (
    <div className="deck-builder">
      <div className="deck-builder__summary">
        <span>
          選択中 {selectedCount} / {DECK_SIZE} 体
        </span>
        <span>
          前衛 {frontCount}/{FRONT_SIZE}・控え {benchCount}/{BENCH_SIZE}
        </span>
      </div>

      <div className="deck-builder__list">
        {characters.map((character) => {
          const card = findCard(character.id);
          const isSelected = card !== undefined;
          const disableCheckbox = !isSelected && selectedCount >= DECK_SIZE;

          return (
            <div
              key={character.id}
              className={
                isSelected ? "deck-builder__item deck-builder__item--selected" : "deck-builder__item"
              }
            >
              <label className="deck-builder__item-main">
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disableCheckbox}
                  onChange={(event) => handleToggleSelect(character.id, event.target.checked)}
                />
                <span className="deck-builder__item-name">{character.name}</span>
                <span className="badge">合計 {character.totalPoints}pt</span>
              </label>

              {card && (
                <div className="deck-builder__role-toggle" role="group" aria-label={`${character.name}の役割`}>
                  <button
                    type="button"
                    className={
                      card.role === "front"
                        ? "button button-primary deck-builder__role-button"
                        : "button button-secondary deck-builder__role-button"
                    }
                    onClick={() => handleRoleChange(character.id, "front")}
                  >
                    前衛
                  </button>
                  <button
                    type="button"
                    className={
                      card.role === "bench"
                        ? "button button-primary deck-builder__role-button"
                        : "button button-secondary deck-builder__role-button"
                    }
                    onClick={() => handleRoleChange(character.id, "bench")}
                  >
                    控え
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
