"use client";

/**
 * 対戦の「戦闘ポップアップ」表示(クライアントコンポーネント)。
 *
 * 元々`BattleSetupForm`(PvP対戦セットアップ)専用に実装していたポップアップUI
 * (戦場背景+カードの「戦闘エリア」`BattleStage` ⇄ 実況テキストの「実況エリア」
 * `BattleLogViewer`、行動/戦闘不能演出、必殺技カットイン、専用BGM)を、
 * ストーリーの戦闘イベント(`StoryBattleButton`)からも再利用できるよう切り出したもの。
 *
 * このコンポーネント自身はAPI呼び出しを行わない(呼び出し元が`submitting`/`battleResult`を
 * 管理し、対戦の開始・結果取得は呼び出し元の責務とする。PvP対戦とストーリー戦闘とで
 * 叩くエンドポイントが異なるため)。呼び出し元は:
 *   1. 対戦開始時に `stageBackground` をランダムに選び(`BATTLE_BACKGROUNDS`から)、
 *      `submitting = true` にしてこのコンポーネントを描画する(ローディング演出)。
 *   2. API応答が返ったら `submitting = false`・`battleResult` に結果をセットする
 *      (このコンポーネントが自動でログ再生・演出付き結果表示に切り替える)。
 *   3. 「閉じる」(`onClose`)が呼ばれたら `battleResult`/`stageBackground` を
 *      `null` に戻し、ポップアップを閉じる(`open`を`false`にする)。
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BattleLogViewer, {
  extractMoveName,
  findActingName,
  findDefeatedName,
  findSpecialMoveName,
  groupByTurn,
} from "@/components/BattleLogViewer";
import type { BattleDetail, Character } from "@/lib/types";
import { musicController } from "@/lib/audio/musicController";
import { assetUrl } from "@/lib/assets";

/** `public/battle-backgrounds/` に配置した戦場背景(`戦闘背景サンプル.png` から切り出したもの)。 */
export const BATTLE_BACKGROUNDS = ["arena", "throne", "forest", "lava", "ice", "sky", "ruins"];

/** ランダムに戦場背景を1つ選ぶ(対戦開始時に呼び出し元が使う)。 */
export function pickBattleBackground(): string {
  return BATTLE_BACKGROUNDS[Math.floor(Math.random() * BATTLE_BACKGROUNDS.length)];
}

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

/**
 * 「対戦開始」後、AI応答を待つ間に表示する専用の戦闘画面。
 * 戦場背景の上に「デッキA名 VS デッキB名」のチームバナーと両者の前衛カードを重ねて表示する。
 */
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
  /** 必殺技が発動したキャラクターのカットイン表示(一定時間で自動的に消える)。
      `team`は所属デッキ(teamA=左側デッキ/teamB=右側デッキ)で、カットインを
      同じ側に表示するために使う。 */
  cutIn?: { character: Character; moveName: string | null; team: "teamA" | "teamB" } | null;
  /** 全ターン開示後の勝敗演出(null=未決着、まだ全ターンが開示されていない)。 */
  winningTeam?: "teamA" | "teamB" | null;
}) {
  return (
    <div
      className="battle-stage"
      style={{ backgroundImage: `url(${assetUrl(`/battle-backgrounds/${background}.png`)})` }}
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
          className={`battle-stage__cutin battle-stage__cutin--${
            cutIn.team === "teamA" ? "left" : "right"
          }`}
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

export default function BattlePopup({
  open,
  deckAName,
  deckBName,
  deckAFront,
  deckABench,
  deckBFront,
  deckBBench,
  battleResult,
  stageBackground,
  onClose,
}: {
  /** falseの間は何も描画しない(ポップアップを開くかどうかは呼び出し元が管理する)。
      呼び出し元はAPI呼び出し中もtrueのままにし、`battleResult`がまだnullの間は
      このコンポーネントが自動的にローディング演出を表示する。 */
  open: boolean;
  deckAName: string;
  deckBName: string;
  deckAFront: Character[];
  deckABench: Character[];
  deckBFront: Character[];
  deckBBench: Character[];
  /** 対戦結果(nullの間はローディング演出のまま)。 */
  battleResult: BattleDetail | null;
  /** `pickBattleBackground()`で選んだ戦場背景。 */
  stageBackground: string | null;
  /** 「閉じる」操作(×ボタン・閉じるボタン)。呼び出し元は`battleResult`/`stageBackground`を
      リセットしてポップアップを閉じること。 */
  onClose: () => void;
}) {
  // ログ側(BattleLogViewer)から開示ターン数を受け取り、戦闘画面(左側)のカードに
  // 行動演出/戦闘不能演出を適用するために使う(ログ画面自体にはカードを表示しない)。
  // `open`がfalseの間、呼び出し元はこのコンポーネント自体を描画しない(アンマウントする)
  // 想定のため、次に開いた時は新規マウントとなり0から自然にやり直される
  // (effectでの明示的なリセットは不要)。
  const [revealedCount, setRevealedCount] = useState(0);

  // 戦闘画面をポップアップ表示している間は、背後のページのスクロールを止める。
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // 戦闘画面(ポップアップ)が開いている間はBattleMusic、それ以外はBaseMusicをループ再生する。
  useEffect(() => {
    if (open) {
      musicController.playBattle();
    } else {
      musicController.playBase();
    }
    return () => {
      musicController.playBase();
    };
  }, [open]);

  const rosterA = useMemo(() => [...deckAFront, ...deckABench], [deckAFront, deckABench]);
  const rosterB = useMemo(() => [...deckBFront, ...deckBBench], [deckBFront, deckBBench]);
  const rosterNames = useMemo(
    () => [...rosterA, ...rosterB].map((character) => character.name),
    [rosterA, rosterB]
  );

  const turns = useMemo(() => groupByTurn(battleResult?.battleLog ?? []), [battleResult]);
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
    () => computeDisplayCards(deckAFront, deckABench, revealedMessages, defeatedNames),
    [deckAFront, deckABench, revealedMessages, defeatedNames]
  );
  const deckBCards = useMemo(
    () => computeDisplayCards(deckBFront, deckBBench, revealedMessages, defeatedNames),
    [deckBFront, deckBBench, revealedMessages, defeatedNames]
  );

  // 全ターンが開示し終わった時点で初めて勝敗演出(戦闘エリアの勝利側ハイライト)を出す
  // (結果自体は`battleResult.result`に最初から含まれているが、実況エリアのログ再生と
  // 演出のタイミングを揃えるため、開示済みターン数で判定する)。
  const isPlaybackComplete = turns.length > 0 && revealedCount >= turns.length;
  const winningTeam = isPlaybackComplete ? battleResult?.result?.winner ?? null : null;

  // 直前に開示されたターンに必殺技の発動が含まれていれば、そのキャラクターの
  // カード画像を戦闘エリアに一定時間だけカットイン表示する。
  const [cutIn, setCutIn] = useState<{
    character: Character;
    moveName: string | null;
    team: "teamA" | "teamB";
  } | null>(null);
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
      // デッキA(左側)所属かデッキB(右側)所属かを判定し、カットインを
      // 発動キャラクターの所属デッキと同じ側(左/右)に表示する。
      const characterA = rosterA.find((candidate) => candidate.name === name);
      const characterB = rosterB.find((candidate) => candidate.name === name);
      const character = characterA ?? characterB;
      if (!character) {
        continue;
      }
      setCutIn({ character, moveName: extractMoveName(message), team: characterA ? "teamA" : "teamB" });
      musicController.playSpecialSound();
      const timer = setTimeout(() => setCutIn(null), 2200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCount]);

  // 直前に開示されたターンで誰かが行動していれば(=`actingNames`)、通常攻撃の効果音を
  // 鳴らす。ただし必殺技発動ターンはカットイン側の効果音(SPAtackSound)と重複させたく
  // ないため除外する。
  useEffect(() => {
    const latestTurn = turns[revealedCount - 1];
    if (!latestTurn || actingNames.size === 0) {
      return;
    }
    const hasSpecialMove = latestTurn.messages.some((message) => findSpecialMoveName(message, rosterNames));
    if (!hasSpecialMove) {
      musicController.playAttackSound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCount]);

  if (!open || !stageBackground) {
    return null;
  }

  const teamName = (team: "teamA" | "teamB"): string => (team === "teamA" ? deckAName : deckBName);

  return (
    <div className="battle-modal-backdrop" role="dialog" aria-modal="true">
      <div className={`battle-modal${battleResult ? " battle-modal--result" : ""}`}>
        {battleResult && (
          <button type="button" className="battle-modal__close" onClick={onClose} aria-label="閉じる">
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
                  <button type="button" className="button button-primary" onClick={onClose}>
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
