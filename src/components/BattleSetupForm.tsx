"use client";

/**
 * 対戦セットアップフォーム(クライアントコンポーネント)。
 *
 * `GET /api/decks` でデッキ一覧を取得し、デッキA/デッキBの2つのプルダウンと
 * 「対戦開始」ボタンを表示する(同一デッキの選択は不可、選択している間はボタンを
 * 無効化しつつ画面下にバリデーションメッセージを表示する)。
 *
 * このゲームにはプレイヤーアバターは存在しないため、`ゲーム画面イメージ/
 * 通常画面イメージ.png` のような対面レイアウトは、各デッキを選択した時点で
 * `GET /api/decks/:id` から取得した前衛4体・控え4体のキャラクターカードを
 * 並べて表示することで再現する(`battle-arena__*`)。
 *
 * カードをクリックするとそのキャラクターの状態(説明・パラメーター・必殺技)を
 * 下部の「カード詳細」パネルに表示する(参照画像の「カード詳細」相当)。
 * このゲームには必殺技を選ぶ操作は無い(AIが戦闘を一括生成するため)ので、
 * あくまで閲覧専用であり、選択が対戦結果に影響することはない。
 *
 * 「対戦開始」ボタン押下後は、`ゲーム画面イメージ/通常戦闘画面.png`・
 * `戦闘背景サンプル.png` を参考にした専用の戦闘画面(`BattleStage`)へ切り替わる。
 * `public/battle-backgrounds/` からランダムに選んだ戦場背景の上に、
 * 「デッキA名 VS デッキB名」のチームバナーと両者のカードを表示し、
 * AI応答を待つ間のローディング演出とする。
 *
 * 結果が返ってきた後もページ遷移はせず、ポップアップ内で左右2カラムの
 * 「結果表示」に切り替わる(呼び方を今後のために統一しておく):
 *   - 左側 = 「戦闘エリア」(`BattleStage`): 戦場背景+カード。
 *   - 右側 = 「実況エリア」(`battle-modal__log`、`BattleLogViewer`):
 *     戦闘前分析・戦闘ログ(実況テキスト)・必殺技演出・最終結果。カードは表示しない。
 * 行動演出/戦闘不能演出は実況エリアの自動ターン送り(2秒おき)に連動しつつ、
 * 見た目の変化そのものは戦闘エリア側のカードに対して行う。
 * 前衛が戦闘不能になった場合、そのカードは戦闘エリア内で下の方へ移動し
 * (`computeDisplayCards`、非戦闘不能を先頭に安定ソート)、実況テキストに登場した
 * 控えメンバー(入れ替わって参戦したとみなす)は戦闘エリアに追加表示する。
 * 必殺技が発動したターンでは、そのキャラクターのカード画像を戦闘エリア上に
 * 大きくカットイン表示する(`findSpecialMoveName`/`extractMoveName`、
 * `cutIn` state、一定時間で自動的に消える)。
 * これらはすべてAIの自由記述テキストからのヒューリスティックな推定であり、
 * 対戦結果そのものには一切影響しない。
 *
 * ボタン押下で `POST /api/battles` に `{ deckAId, deckBId }` を送信する。
 * `docs/設計.md` 0章-4「戦闘実行は同期API呼び出しとする」の通りAPI呼び出しは
 * 数秒〜十数秒かかりうる(Claude APIを同期的に呼び出すため)ため、送信中は
 * その旨を案内するローディング表示に切り替える。成功時(201)は返却された
 * `BattleDetail.id` を使って `/battles/[id]` へ遷移し、失敗時(502、または
 * その他のエラー)はエラーメッセージを表示したうえでボタンを再度有効化し、
 * 同じ選択のまま再試行できるようにする(`src/app/decks/new/page.tsx` と同じ
 * 「フォームの選択状態は保持したままエラー表示のみ更新する」方針)。
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BattleLogViewer, {
  extractMoveName,
  findActingName,
  findDefeatedName,
  findSpecialMoveName,
  groupByTurn,
} from "@/components/BattleLogViewer";
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

/** `public/battle-backgrounds/` に配置した戦場背景(`戦闘背景サンプル.png` から切り出したもの)。 */
const BATTLE_BACKGROUNDS = ["arena", "throne", "forest", "lava", "ice", "sky", "ruins"];

/**
 * 戦闘エリアに表示するカード一覧を組み立てる。
 * 前衛4体に加え、これまでに開示された実況テキストに名前が登場した控えメンバーを
 * 「入れ替わって参戦した」とみなして追加し、戦闘不能になったキャラクターは
 * (非戦闘不能を先頭にした安定ソートで)一覧の下の方へ移動させる。
 */
function computeDisplayCards(
  front: Character[],
  bench: Character[],
  revealedMessages: string[],
  defeatedNames: Set<string>
): Character[] {
  const activatedBench = bench.filter((character) =>
    revealedMessages.some((message) => message.includes(character.name))
  );
  const combined = [...front, ...activatedBench];
  return [...combined].sort((a, b) => {
    const aDefeated = defeatedNames.has(a.name) ? 1 : 0;
    const bDefeated = defeatedNames.has(b.name) ? 1 : 0;
    return aDefeated - bDefeated;
  });
}

/**
 * 「対戦開始」後、AI応答を待つ間に表示する専用の戦闘画面。
 * 戦場背景の上に「デッキA名 VS デッキB名」のチームバナーと両者の前衛カードを重ねて表示する。
 */
/** 戦闘画面上の1枚のカード(行動演出・戦闘不能演出はロースターと同じクラスを流用)。 */
function StageCard({
  character,
  isActing,
  isDefeated,
}: {
  character: Character;
  isActing: boolean;
  isDefeated: boolean;
}) {
  const className = [
    "battle-stage__card",
    isActing && "battle-roster__card--acting",
    isDefeated && "battle-roster__card--defeated",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className} title={character.name}>
      {/* `battle-roster__card-thumb` も付与し、行動演出/戦闘不能演出のCSS
          (`.battle-roster__card--acting .battle-roster__card-thumb` 等)を共有する。 */}
      <div className="battle-stage__card-thumb battle-roster__card-thumb">
        {character.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
          <img src={character.imageUrl} alt={character.name} />
        ) : (
          <span className="battle-arena__mini-card-placeholder">No Image</span>
        )}
      </div>
      <p className="battle-stage__card-name">{character.name}</p>
    </div>
  );
}

function BattleStage({
  background,
  deckAName,
  deckBName,
  deckACards,
  deckBCards,
  showLoading = true,
  actingNames,
  defeatedNames,
  revealedCount,
  cutIn,
  winningTeam,
}: {
  background: string;
  deckAName: string;
  deckBName: string;
  /** 表示するカード一覧(前衛+入れ替わって参戦した控え、戦闘不能は末尾)。 */
  deckACards: Character[];
  deckBCards: Character[];
  showLoading?: boolean;
  actingNames?: Set<string>;
  defeatedNames?: Set<string>;
  revealedCount?: number;
  /** 必殺技が発動したキャラクターのカットイン表示(一定時間で自動的に消える)。 */
  cutIn?: { character: Character; moveName: string | null } | null;
  /** 全ターン開示後の勝敗演出(null=未決着、まだ全ターンが開示されていない)。 */
  winningTeam?: "teamA" | "teamB" | null;
}) {
  return (
    <div
      className="battle-stage"
      style={{ backgroundImage: `url(/battle-backgrounds/${background}.png)` }}
      role="status"
      aria-live="polite"
    >
      <div className="battle-stage__overlay">
        <div className="battle-stage__header">
          <span
            className={`battle-stage__team-label battle-stage__team-label--a${
              winningTeam === "teamA" ? " battle-stage__team-label--victory" : ""
            }`}
          >
            {deckAName}
            {winningTeam === "teamA" && <span className="battle-stage__crown" aria-hidden="true">♛</span>}
          </span>
          <span className="battle-stage__vs" aria-hidden="true">
            VS
          </span>
          <span
            className={`battle-stage__team-label battle-stage__team-label--b${
              winningTeam === "teamB" ? " battle-stage__team-label--victory" : ""
            }`}
          >
            {winningTeam === "teamB" && <span className="battle-stage__crown" aria-hidden="true">♛</span>}
            {deckBName}
          </span>
        </div>

        <div className="battle-stage__teams">
          {/* 自分のデッキ(左)と相手のデッキ(右)の間を離して、一目で区別できるようにする。
              全ターン開示後は勝ったチームの列を金色に輝かせ、負けたチームは沈ませて
              一目で勝敗が分かるようにする。 */}
          <div
            className={[
              "battle-stage__team-column",
              winningTeam === "teamA" && "battle-stage__team-column--victory",
              winningTeam === "teamB" && "battle-stage__team-column--defeat",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {winningTeam === "teamA" && (
              <p className="battle-stage__victory-badge">勝利</p>
            )}
            {deckACards.map((character) => {
              const isActing = actingNames?.has(character.name) ?? false;
              return (
                <StageCard
                  // 行動演出は毎回揺れを再生させたいため、行動したターンが変わるたびに
                  // keyを変えて再マウントし、CSSアニメーションを再生させる。
                  key={isActing ? `${character.id}-turn-${revealedCount}` : character.id}
                  character={character}
                  isActing={isActing}
                  isDefeated={defeatedNames?.has(character.name) ?? false}
                />
              );
            })}
          </div>

          <div
            className={[
              "battle-stage__team-column",
              winningTeam === "teamB" && "battle-stage__team-column--victory",
              winningTeam === "teamA" && "battle-stage__team-column--defeat",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {winningTeam === "teamB" && (
              <p className="battle-stage__victory-badge">勝利</p>
            )}
            {deckBCards.map((character) => {
              const isActing = actingNames?.has(character.name) ?? false;
              return (
                <StageCard
                  key={isActing ? `${character.id}-turn-${revealedCount}` : character.id}
                  character={character}
                  isActing={isActing}
                  isDefeated={defeatedNames?.has(character.name) ?? false}
                />
              );
            })}
          </div>
        </div>

        {showLoading && (
          <div className="battle-stage__loading">
            <span className="battle-setup__spinner" aria-hidden="true" />
            <p>
              アルゼリオンが戦況を裁定しています。応答には数秒〜十数秒程度かかる場合があります。そのままお待ちください。
            </p>
          </div>
        )}
      </div>

      {cutIn && (
        <div
          // 同じキャラクターが連続して必殺技を発動してもカットインを再生させたいため、
          // 開示ターン数が変わるたびにkeyを変えて再マウントし、CSSアニメーションを再生させる。
          key={`${cutIn.character.id}-turn-${revealedCount}`}
          className="battle-stage__cutin"
        >
          <div className="battle-stage__cutin-image">
            {cutIn.character.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
              <img src={cutIn.character.imageUrl} alt={cutIn.character.name} />
            ) : (
              <span className="battle-arena__mini-card-placeholder">No Image</span>
            )}
          </div>
          <div className="battle-stage__cutin-text">
            <p className="battle-stage__cutin-label">必殺技</p>
            <p className="battle-stage__cutin-name">{cutIn.character.name}</p>
            {cutIn.moveName && <p className="battle-stage__cutin-move">『{cutIn.moveName}』</p>}
          </div>
        </div>
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
  // ログ側(BattleLogViewer)から開示ターン数を受け取り、戦闘画面(左側)のカードに
  // 行動演出/戦闘不能演出を適用するために使う(ログ画面自体にはカードを表示しない)。
  const [revealedCount, setRevealedCount] = useState(0);

  const isPopupOpen = submitting || battleResult !== null;

  // 戦闘画面をポップアップ表示している間は、背後のページのスクロールを止める。
  useEffect(() => {
    if (!isPopupOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPopupOpen]);

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

  const rosterA = useMemo(
    () => [...(deckADetail?.front ?? []), ...(deckADetail?.bench ?? [])],
    [deckADetail]
  );
  const rosterB = useMemo(
    () => [...(deckBDetail?.front ?? []), ...(deckBDetail?.bench ?? [])],
    [deckBDetail]
  );
  const rosterNames = useMemo(
    () => [...rosterA, ...rosterB].map((character) => character.name),
    [rosterA, rosterB]
  );

  // ログ側の開示ターン数(`revealedCount`、`onRevealedCountChange`経由でミラーしたもの)から、
  // 戦闘画面(左側)のカードに適用する「行動した/戦闘不能になった」キャラクター名を求める
  // (`BattleLogViewer`内部のロースター用ロジックと同じ関数を再利用)。
  const turns = useMemo(
    () => groupByTurn(battleResult?.battleLog ?? []),
    [battleResult]
  );
  const actingNames = useMemo(() => {
    const names = new Set<string>();
    const latestTurn = turns[revealedCount - 1];
    if (latestTurn) {
      for (const message of latestTurn.messages) {
        const name = findActingName(message, rosterNames);
        if (name) {
          names.add(name);
        }
      }
    }
    return names;
  }, [turns, revealedCount, rosterNames]);
  const defeatedNames = useMemo(() => {
    const names = new Set<string>();
    for (const group of turns.slice(0, revealedCount)) {
      for (const message of group.messages) {
        const name = findDefeatedName(message, rosterNames);
        if (name) {
          names.add(name);
        }
      }
    }
    return names;
  }, [turns, revealedCount, rosterNames]);

  // 開示済みの実況テキストをすべて連結し、控えメンバーの参戦検知(名前の言及有無)に使う。
  const revealedMessages = useMemo(
    () => turns.slice(0, revealedCount).flatMap((group) => group.messages),
    [turns, revealedCount]
  );
  const deckACards = useMemo(
    () =>
      computeDisplayCards(
        deckADetail?.front ?? [],
        deckADetail?.bench ?? [],
        revealedMessages,
        defeatedNames
      ),
    [deckADetail, revealedMessages, defeatedNames]
  );
  const deckBCards = useMemo(
    () =>
      computeDisplayCards(
        deckBDetail?.front ?? [],
        deckBDetail?.bench ?? [],
        revealedMessages,
        defeatedNames
      ),
    [deckBDetail, revealedMessages, defeatedNames]
  );

  // 全ターンが開示し終わった時点で初めて勝敗演出(戦闘エリアの勝利側ハイライト)を出す
  // (結果自体は`battleResult.result`に最初から含まれているが、実況エリアのログ再生と
  // 演出のタイミングを揃えるため、開示済みターン数で判定する)。
  const isPlaybackComplete = turns.length > 0 && revealedCount >= turns.length;
  const winningTeam = isPlaybackComplete ? battleResult?.result?.winner ?? null : null;

  // 直前に開示されたターンに必殺技の発動が含まれていれば、そのキャラクターの
  // カード画像を戦闘エリアに一定時間だけカットイン表示する。
  const [cutIn, setCutIn] = useState<{ character: Character; moveName: string | null } | null>(null);
  useEffect(() => {
    const latestTurn = turns[revealedCount - 1];
    if (!latestTurn) {
      return;
    }
    for (const message of latestTurn.messages) {
      const name = findSpecialMoveName(message, rosterNames);
      if (!name) {
        continue;
      }
      const character = [...rosterA, ...rosterB].find((candidate) => candidate.name === name);
      if (!character) {
        continue;
      }
      setCutIn({ character, moveName: extractMoveName(message) });
      const timer = setTimeout(() => setCutIn(null), 2200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCount]);

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
    setRevealedCount(0);
    setCutIn(null);
    setStageBackground(BATTLE_BACKGROUNDS[Math.floor(Math.random() * BATTLE_BACKGROUNDS.length)]);

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
    setRevealedCount(0);
    setCutIn(null);
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
      setRevealedCount(0);
      setCutIn(null);
      setStageBackground(BATTLE_BACKGROUNDS[Math.floor(Math.random() * BATTLE_BACKGROUNDS.length)]);
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
    const teamName = (team: "teamA" | "teamB"): string => (team === "teamA" ? deckAName : deckBName);

    return (
      <div className="battle-modal-backdrop" role="dialog" aria-modal="true">
        <div className={`battle-modal${battleResult ? " battle-modal--result" : ""}`}>
          {battleResult && (
            <button
              type="button"
              className="battle-modal__close"
              onClick={handleCloseResult}
              aria-label="閉じる"
            >
              ×
            </button>
          )}

          <div className={battleResult ? "battle-modal__layout" : undefined}>
            <div className={battleResult ? "battle-modal__column" : undefined}>
              {battleResult && <p className="battle-modal__column-label">戦闘エリア</p>}
              <BattleStage
                background={stageBackground}
                deckAName={deckAName}
                deckBName={deckBName}
                deckACards={deckACards}
                deckBCards={deckBCards}
                showLoading={!battleResult}
                actingNames={actingNames}
                defeatedNames={defeatedNames}
                revealedCount={revealedCount}
                cutIn={cutIn}
                winningTeam={winningTeam}
              />
            </div>

            {battleResult && (
              <div className="battle-modal__column">
                <p className="battle-modal__column-label">実況エリア</p>
                <div className="battle-modal__log">
                  {battleResult.status === "failed" && (
                    <div className="form-error-banner" role="alert" style={{ marginBottom: "1.25rem" }}>
                      対戦の実行に失敗しました: {battleResult.errorMessage ?? "詳細不明のエラーが発生しました。"}
                    </div>
                  )}

                  {battleResult.analysis && (
                    <div className="battle-detail__analysis-teams" style={{ marginBottom: "1.25rem" }}>
                      <div className="battle-detail__analysis-team battle-detail__analysis-team--a">
                        <h3>{deckAName}</h3>
                        <p>{battleResult.analysis.teamA}</p>
                      </div>
                      <div className="battle-detail__analysis-team battle-detail__analysis-team--b">
                        <h3>{deckBName}</h3>
                        <p>{battleResult.analysis.teamB}</p>
                      </div>
                    </div>
                  )}

                  <BattleLogViewer
                    entries={battleResult.battleLog}
                    events={battleResult.events}
                    showRoster={false}
                    onRevealedCountChange={setRevealedCount}
                  />

                  {battleResult.result && (
                    <section className="battle-result-banner" style={{ marginTop: "1.25rem" }}>
                      <p className="battle-result-banner__label">最終結果</p>
                      <p className="battle-result-banner__winner">
                        {teamName(battleResult.result.winner)} の勝利!
                      </p>
                      <p className="battle-result-banner__mvp">MVP: {battleResult.result.mvpName}</p>
                    </section>
                  )}

                  <div className="button-group" style={{ marginTop: "1.25rem" }}>
                    <Link href={`/battles/${battleResult.id}`} className="button button-secondary">
                      詳細ページで見る
                    </Link>
                    <button type="button" className="button button-primary" onClick={handleCloseResult}>
                      閉じる
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
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
