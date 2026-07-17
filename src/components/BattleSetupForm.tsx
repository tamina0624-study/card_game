"use client";

/**
 * 対戦セットアップフォーム(クライアントコンポーネント)。
 *
 * `GET /api/decks` でデッキ一覧を取得し、デッキA/デッキBの2つのプルダウンと
 * 「対戦開始」ボタンを表示する(同一デッキの選択は不可、選択している間はボタンを
 * 無効化しつつ画面下にバリデーションメッセージを表示する)。
 *
 * このゲームにはプレイヤーアバターは存在しないため、`docs/参考画像/ゲーム画面イメージ/
 * 通常画面イメージ.png` のような対面レイアウトは、各デッキを選択した時点で
 * `GET /api/decks/:id` から取得した前衛4体・控え4体のキャラクターカードを
 * 並べて表示することで再現する(`battle-arena__*`)。
 *
 * カードをクリックするとそのキャラクターの状態(説明・パラメーター・必殺技)を
 * 下部の「カード詳細」パネルに表示する(参照画像の「カード詳細」相当)。
 * このゲームには必殺技を選ぶ操作は無い(AIが戦闘を一括生成するため)ので、
 * あくまで閲覧専用であり、選択が対戦結果に影響することはない。
 *
 * 「対戦開始」ボタン押下後は専用の戦闘ポップアップ(`BattlePopup`、ストーリーの
 * 戦闘イベント`StoryBattleButton`とも共有)へ切り替わる。このフォーム自身は
 * `submitting`/`battleResult`/`stageBackground` を管理して`BattlePopup`に渡すだけで、
 * 戦場演出(戦闘エリア⇄実況エリア、行動/戦闘不能演出、必殺技カットイン、専用BGM等)の
 * 実装自体は`BattlePopup`側の責務(詳細はそちらのコメント参照)。
 *
 * ボタン押下で `POST /api/battles` に `{ deckAId, deckBId }` を送信する。
 * `docs/設計.md` 0章-4「戦闘実行は同期API呼び出しとする」の通りAPI呼び出しは
 * 数秒〜十数秒かかりうる(Claude APIを同期的に呼び出すため)ため、送信中は
 * ポップアップのローディング演出に切り替える。成功時(201)は返却された
 * `BattleDetail` をそのままポップアップの結果表示に渡し(ページ遷移はしない)、
 * 失敗時(502、またはその他のエラー)はポップアップを開かずその場にエラー
 * メッセージを表示したうえで、同じ選択のまま再試行できるようにする
 * (`src/app/decks/new/page.tsx` と同じ「フォームの選択状態は保持したまま
 * エラー表示のみ更新する」方針)。
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import BattlePopup, { pickBattleBackground } from "@/components/BattlePopup";
import type { BattleDetail, BattleSummary, Character, Deck, DeckSummary } from "@/lib/types";

type DeckLoadState = "loading" | "loaded" | "error";

/** SQLiteの `datetime('now')` 形式("YYYY-MM-DD HH:MM:SS"、UTC)を日本語表記に整形する。 */
function formatDateTime(value: string): string {
  const isoLike = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABELS: Record<BattleSummary["status"], string> = {
  pending: "準備中",
  running: "対戦中",
  completed: "完了",
  failed: "失敗",
};

/** 対戦履歴1件の「勝敗」表示テキストを組み立てる。 */
function formatOutcome(battle: BattleSummary): string {
  if (battle.status === "completed" && battle.winner) {
    const winnerDeckName = battle.winner === "teamA" ? battle.deckA.name : battle.deckB.name;
    return `${winnerDeckName} の勝利`;
  }
  return STATUS_LABELS[battle.status];
}

/** 対戦履歴1件のステータスに応じたバッジの色分けクラス(勝利=ゴールド・失敗=赤・その他=中立)。 */
function outcomeBadgeClassName(battle: BattleSummary): string {
  if (battle.status === "completed") {
    return "badge badge--win";
  }
  if (battle.status === "failed") {
    return "badge badge--fail";
  }
  return "badge badge--pending";
}

/** 前衛/控えの並びで表示する、コンパクトなキャラクターカード。クリックで詳細表示を通知する。 */
function MiniCharacterCard({
  character,
  isSelected,
  onSelect,
}: {
  character: Character;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`battle-arena__mini-card${isSelected ? " battle-arena__mini-card--selected" : ""}`}
      onClick={onSelect}
      title={character.name}
    >
      <div className="battle-arena__mini-card-thumb">
        {character.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
          <img src={character.imageUrl} alt={character.name} />
        ) : (
          <span className="battle-arena__mini-card-placeholder">No Image</span>
        )}
      </div>
      <p className="battle-arena__mini-card-name">{character.name}</p>
    </button>
  );
}

/** 1チーム分(前衛4体・控え4体)のカード表示。デッキ詳細が未取得(未選択)の間は何も表示しない。 */
function TeamCards({
  deck,
  selectedCharacterId,
  onSelectCharacter,
}: {
  deck: Deck | null;
  selectedCharacterId: number | null;
  onSelectCharacter: (character: Character) => void;
}) {
  if (!deck) {
    return null;
  }
  return (
    <div className="battle-arena__cards">
      <p className="battle-arena__role-label">前衛</p>
      <div className="battle-arena__card-row">
        {deck.front.map((character) => (
          <MiniCharacterCard
            key={character.id}
            character={character}
            isSelected={character.id === selectedCharacterId}
            onSelect={() => onSelectCharacter(character)}
          />
        ))}
      </div>
      <p className="battle-arena__role-label">控え</p>
      <div className="battle-arena__card-row">
        {deck.bench.map((character) => (
          <MiniCharacterCard
            key={character.id}
            character={character}
            isSelected={character.id === selectedCharacterId}
            onSelect={() => onSelectCharacter(character)}
          />
        ))}
      </div>
    </div>
  );
}

/** クリックされたキャラクターの状態(説明・パラメーター・必殺技)を表示する、閲覧専用の詳細パネル。 */
function CharacterDetailPanel({ character }: { character: Character | null }) {
  if (!character) {
    return (
      <div className="card battle-arena__detail battle-arena__detail--empty">
        <p style={{ color: "var(--muted)" }}>
          上のカードをクリックすると、そのキャラクターの状態がここに表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="card battle-arena__detail">
      <div className="battle-arena__detail-header">
        <div className="battle-arena__detail-thumb">
          {character.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
            <img src={character.imageUrl} alt={character.name} />
          ) : (
            <span className="battle-arena__mini-card-placeholder">No Image</span>
          )}
        </div>
        <div>
          <h3 className="battle-arena__detail-name">{character.name}</h3>
          {character.description && (
            <p className="battle-arena__detail-desc">{character.description}</p>
          )}
        </div>
      </div>

      <div className="battle-arena__detail-params">
        {character.parameters.map((parameter) => (
          <span key={parameter.id} className="badge">
            {parameter.name} {parameter.value}
          </span>
        ))}
        <span className="badge">合計 {character.totalPoints}pt</span>
      </div>

      {character.specialMoves.length > 0 && (
        <dl className="battle-arena__detail-moves">
          {character.specialMoves.map((move) => (
            <div key={move.id} className="battle-arena__detail-move">
              <dt>{move.name}</dt>
              {move.description && <dd>{move.description}</dd>}
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function BattleSetupForm({ battles }: { battles: BattleSummary[] }) {
  const router = useRouter();

  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deckLoadState, setDeckLoadState] = useState<DeckLoadState>("loading");

  const [deckAId, setDeckAId] = useState("");
  const [deckBId, setDeckBId] = useState("");
  const [deckADetail, setDeckADetail] = useState<Deck | null>(null);
  const [deckBDetail, setDeckBDetail] = useState<Deck | null>(null);

  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stageBackground, setStageBackground] = useState<string | null>(null);
  const [battleResult, setBattleResult] = useState<BattleDetail | null>(null);

  const isPopupOpen = submitting || battleResult !== null;

  useEffect(() => {
    let cancelled = false;

    async function loadDecks() {
      setDeckLoadState("loading");
      try {
        const response = await fetch("/api/decks", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("デッキ一覧の取得に失敗しました。");
        }
        const data = (await response.json()) as DeckSummary[];
        if (!cancelled) {
          setDecks(data);
          setDeckLoadState("loaded");
        }
      } catch {
        if (!cancelled) {
          setDeckLoadState("error");
        }
      }
    }

    loadDecks();
    return () => {
      cancelled = true;
    };
  }, []);

  /** デッキA/Bの選択が変わるたびに、そのデッキの前衛/控えカード一覧(詳細)を取得する。 */
  function useDeckDetail(deckId: string, setDetail: (deck: Deck | null) => void) {
    useEffect(() => {
      let cancelled = false;
      if (deckId === "") {
        setDetail(null);
        return;
      }
      fetch(`/api/decks/${deckId}`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<Deck>) : null))
        .then((data) => {
          if (!cancelled) {
            setDetail(data);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDetail(null);
          }
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckId]);
  }

  useDeckDetail(deckAId, setDeckADetail);
  useDeckDetail(deckBId, setDeckBDetail);

  const isSameDeckSelected = deckAId !== "" && deckBId !== "" && deckAId === deckBId;
  const isSelectionComplete = deckAId !== "" && deckBId !== "";
  // `deckADetail`/`deckBDetail` は選択IDが変わってから非同期で取得されるため、
  // カード詳細の取得が完了する前に「対戦開始」を押せてしまうと戦闘画面(BattleStage)に
  // 片方のデッキのカードが表示されない不具合につながる。両方のデッキ詳細が
  // 取得済みになるまでは送信不可にする。
  const canSubmit =
    !submitting &&
    deckLoadState === "loaded" &&
    isSelectionComplete &&
    !isSameDeckSelected &&
    deckADetail !== null &&
    deckBDetail !== null;

  async function handleStartBattle() {
    if (!canSubmit) {
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    setStageBackground(pickBattleBackground());

    try {
      const response = await fetch("/api/battles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckAId: Number(deckAId), deckBId: Number(deckBId) }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const message =
          (record && typeof record.errorMessage === "string" && record.errorMessage) ||
          (record && typeof record.error === "string" && record.error) ||
          "対戦の実行に失敗しました。しばらくしてから再度お試しください。";
        setSubmitError(message);
        setSubmitting(false);
        return;
      }

      const battle = data as BattleDetail;
      // ページ遷移はせず、ポップアップ内でローディング表示から結果表示(ログ再生)へ
      // 切り替える。ユーザーが「閉じる」を押すまで同じポップアップ上で完結させる。
      setBattleResult(battle);
      setSubmitting(false);
    } catch {
      setSubmitError("通信エラーが発生しました。しばらくしてから再度お試しください。");
      setSubmitting(false);
    }
  }

  /** ポップアップを閉じ、対戦履歴が最新化されるようページデータを更新する。 */
  function handleCloseResult() {
    setBattleResult(null);
    setStageBackground(null);
    router.refresh();
  }

  /**
   * 対戦履歴の1件をクリックした際、新規対戦と同じポップアップ(戦闘エリア/実況エリア)で
   * その対戦を再生できるようにする。`GET /api/battles/:id` で詳細を取得し、
   * `deckAId`/`deckBId` をその対戦のデッキIDに合わせることで(既存の
   * `useDeckDetail` が自動的に前衛/控えカードを取得し直す)戦闘エリアのカードも
   * 復元する。ページ遷移はしないため、詳細ページ(`/battles/:id`)へのリンクは
   * ポップアップ内に別途用意する。
   */
  async function handleViewHistoryBattle(battleId: number) {
    try {
      const response = await fetch(`/api/battles/${battleId}`, { cache: "no-store" });
      if (!response.ok) {
        window.alert("対戦履歴の取得に失敗しました。");
        return;
      }
      const detail = (await response.json()) as BattleDetail;
      setDeckAId(String(detail.deckA.id));
      setDeckBId(String(detail.deckB.id));
      setSelectedCharacter(null);
      setStageBackground(pickBattleBackground());
      setBattleResult(detail);
    } catch {
      window.alert("通信エラーが発生しました。しばらくしてから再度お試しください。");
    }
  }

  // セットアップカードの中身(デッキ読み込み中/失敗、デッキ不足、通常のアリーナ)を
  // 切り替える。対戦履歴セクションはこれらの状態に関わらず常に表示する
  // (履歴を参照するのにデッキ一覧の取得成功を必須にしない)。
  let setupBody: ReactNode;
  if (deckLoadState === "loading") {
    setupBody = <p style={{ color: "var(--muted)" }}>デッキ一覧を読み込み中...</p>;
  } else if (deckLoadState === "error") {
    setupBody = (
      <p className="form-error" role="alert">
        デッキ一覧の取得に失敗しました。しばらくしてから再度お試しください。
      </p>
    );
  } else if (decks.length < 2) {
    setupBody = (
      <p style={{ color: "var(--muted)" }}>
        対戦するには少なくとも2つのデッキが必要です。「デッキ編成」から作成してください。
      </p>
    );
  }

  if (isPopupOpen && stageBackground) {
    const deckAName = decks.find((deck) => String(deck.id) === deckAId)?.name ?? "デッキA";
    const deckBName = decks.find((deck) => String(deck.id) === deckBId)?.name ?? "デッキB";

    return (
      <BattlePopup
        open
        deckAName={deckAName}
        deckBName={deckBName}
        deckAFront={deckADetail?.front ?? []}
        deckABench={deckADetail?.bench ?? []}
        deckBFront={deckBDetail?.front ?? []}
        deckBBench={deckBDetail?.bench ?? []}
        battleResult={battleResult}
        stageBackground={stageBackground}
        onClose={handleCloseResult}
      />
    );
  }

  return (
    <>
      <section className="card battle-setup-section">
        <h2 style={{ marginBottom: "1rem" }}>対戦セットアップ</h2>

        {setupBody ?? (
          <div className="battle-setup">
            {submitError && (
              <div className="form-error-banner" role="alert">
                {submitError}
              </div>
            )}

            <div className="battle-arena">
              <div className="battle-arena__team battle-arena__team--a">
                <div className="form-field">
                  <label htmlFor="battle-deck-a">デッキA</label>
                  <select
                    id="battle-deck-a"
                    value={deckAId}
                    onChange={(event) => {
                      setDeckAId(event.target.value);
                      setSelectedCharacter(null);
                    }}
                  >
                    <option value="">選択してください</option>
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </div>
                <TeamCards
                  deck={deckADetail}
                  selectedCharacterId={selectedCharacter?.id ?? null}
                  onSelectCharacter={setSelectedCharacter}
                />
              </div>

              <div className="battle-arena__vs" aria-hidden="true">
                VS
              </div>

              <div className="battle-arena__team battle-arena__team--b">
                <div className="form-field">
                  <label htmlFor="battle-deck-b">デッキB</label>
                  <select
                    id="battle-deck-b"
                    value={deckBId}
                    onChange={(event) => {
                      setDeckBId(event.target.value);
                      setSelectedCharacter(null);
                    }}
                  >
                    <option value="">選択してください</option>
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </div>
                <TeamCards
                  deck={deckBDetail}
                  selectedCharacterId={selectedCharacter?.id ?? null}
                  onSelectCharacter={setSelectedCharacter}
                />
              </div>
            </div>

            <CharacterDetailPanel character={selectedCharacter} />

            {isSameDeckSelected && (
              <p className="form-error" role="alert">
                同じデッキ同士では対戦できません。異なるデッキを選択してください。
              </p>
            )}

            <div className="button-group battle-arena__action">
              <button
                type="button"
                className="button button-primary"
                disabled={!canSubmit}
                onClick={handleStartBattle}
              >
                {submitError ? "再試行" : "対戦開始"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="battle-history-section">
        <h2 style={{ marginBottom: "1rem" }}>対戦履歴</h2>

        {battles.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            まだ対戦履歴がありません。上の「対戦セットアップ」から最初の対戦を実行しましょう。
          </p>
        ) : (
          <div className="battle-history-list">
            {battles.map((battle) => (
              <button
                type="button"
                key={battle.id}
                className="card battle-history-item"
                onClick={() => handleViewHistoryBattle(battle.id)}
              >
                <div className="battle-history-item__matchup">
                  <span>{battle.deckA.name}</span>
                  <span className="battle-history-item__vs">vs</span>
                  <span>{battle.deckB.name}</span>
                </div>
                <div className="battle-history-item__meta">
                  <span className={outcomeBadgeClassName(battle)}>{formatOutcome(battle)}</span>
                  <span className="battle-history-item__date">{formatDateTime(battle.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
