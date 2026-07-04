"use client";

/**
 * 戦闘ログビューア(クライアントコンポーネント)。
 *
 * `BattleDetail.battleLog`(`{turn, message}[]`、DB取得時点で `sort_order ASC` = AIが
 * 出力した順序のまま)を受け取り、ターン単位でグルーピングして表示する。
 *
 * 初期表示は最初のターンのみで、以降は2秒おきに自動で1ターンずつ表示を
 * 進めていく(手動の「ターン終了」ボタンは廃止)。あわせて「スキップ」ボタンで
 * 一気に全ターンを表示することもできる。
 *
 * タスク17(必殺技演出イベントの簡易表示実装)で `events`(`BattleDetail.events`)を
 * 受け取れるように拡張した。`event.turn` が `battleLog` に実在するターン番号と一致する
 * 場合は、そのターンブロック(該当ターンのメッセージ群の直後)に `BattleEventCard` を
 * 差し込んで表示する。`event.turn` が `null`、または `battleLog` に存在しないターン番号を
 * 指している場合は、ログ末尾の「演出」セクションにまとめて表示する(いずれの場合も
 * ターン送りのステップ表示とは独立して、該当ターンが開示されたタイミング/末尾に表示する)。
 *
 * 両チームの全キャラクター(前衛+控え)をカードで並べた「ロースター」を表示できる
 * (`showRoster`、既定で有効)。対戦ポップアップ(`BattleSetupForm`)側で戦闘画面
 * (`BattleStage`)にカードを表示する場合はログ側のロースターは不要になるため
 * `showRoster={false}` で非表示にし、代わりに `onRevealedCountChange` でターンの
 * 開示状況を親コンポーネントへ伝え、行動演出/戦闘不能演出を戦闘画面側のカードに
 * 適用してもらう(いずれもAIの自由記述テキストからヒューリスティックに推定する
 * ベストエフォートの演出であり、対戦結果そのものには一切影響しない):
 *   - 行動演出: 直前に開示されたターンのメッセージ内で、そのメッセージ中に最も早く
 *     登場するロースター上のキャラクター名を「行動したキャラクター」とみなし、
 *     カードを一度だけ揺らす(`battle-roster__card--acting`)。
 *   - 戦闘不能演出: これまでに開示された全メッセージのうち「戦闘不能」「倒した」
 *     等(`DEFEAT_KEYWORDS`)を含むものについて、その語より前で最後に登場した
 *     キャラクター名を「倒れた
 *     キャラクター」とみなし、以降そのカードをグレイアウトする(`--defeated`)。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleEventDetail, BattleLogEntry, Character } from "@/lib/types";
import BattleEventCard from "@/components/BattleEventCard";

type TurnGroup = {
  turn: number;
  messages: string[];
};

/**
 * `battleLog` を並び順を保ったまま「同じ`turn`値が連続する区間」ごとにグルーピングする。
 * AIの出力は1ターンにつき複数の実況メッセージを含みうるため(1ターン1メッセージとは
 * 限らない)、同じターン番号のメッセージはまとめて1ブロックとして表示する。
 *
 * `BattleSetupForm`(対戦ポップアップ)が戦闘画面側のカードに行動/戦闘不能演出を
 * 適用する際にも同じロジックを使うため、他コンポーネントから再利用できるよう
 * `findActingName`/`findDefeatedName` とあわせてexportする。
 */
export function groupByTurn(entries: BattleLogEntry[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.turn === entry.turn) {
      last.messages.push(entry.message);
    } else {
      groups.push({ turn: entry.turn, messages: [entry.message] });
    }
  }
  return groups;
}

/** メッセージ内で最も早く登場するロースター上のキャラクター名(行動した本人と推定)を返す。 */
export function findActingName(message: string, rosterNames: string[]): string | null {
  let earliestIndex = Infinity;
  let found: string | null = null;
  for (const name of rosterNames) {
    const index = message.indexOf(name);
    if (index !== -1 && index < earliestIndex) {
      earliestIndex = index;
      found = name;
    }
  }
  return found;
}

/**
 * メッセージ中の`keywords`いずれかの出現位置より前で、最後に登場したロースター名を返す
 * (「〇〇が△△を発動した」のように、対象キャラクター名がキーワードの直前に来る言い回しを
 * 前提としたヒューリスティック)。
 *
 * 1メッセージに複数のキーワード出現がありうる(例:「チームB全員が次々に
 * 戦闘不能に!最後の〇〇さえも...倒れ」のような要約文は、最初の「戦闘不能」の
 * 前には固有名詞が無く、後方の「倒れ」の直前に本人の名前が来る)。そのため
 * 出現位置が早いキーワードから順に試し、直前に名前が見つかった時点のものを
 * 採用する(最初に見つかったキーワードで名前が無ければ次のキーワードを試す)。
 */
function findNameBeforeKeywords(message: string, rosterNames: string[], keywords: string[]): string | null {
  const keywordIndices: number[] = [];
  for (const keyword of keywords) {
    let index = message.indexOf(keyword);
    while (index !== -1) {
      keywordIndices.push(index);
      index = message.indexOf(keyword, index + 1);
    }
  }
  keywordIndices.sort((a, b) => a - b);

  for (const keywordIndex of keywordIndices) {
    let bestIndex = -1;
    let found: string | null = null;
    for (const name of rosterNames) {
      const index = message.lastIndexOf(name, keywordIndex);
      if (index !== -1 && index > bestIndex) {
        bestIndex = index;
        found = name;
      }
    }
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * 「戦闘不能」に類する語(AIの言い回しは一定しないため複数パターンを許容する)。
 * 実際の生成結果では「戦闘不能」の他に「倒した」「倒れ」等が多用されることを
 * 確認済み(`lib/battles/prompt.ts`の確定事項で「戦闘不能になった」の明記を
 * 指示済みだが、念のため揺れも許容する)。
 */
const DEFEAT_KEYWORDS = ["戦闘不能", "倒した", "倒れ", "撃破", "沈黙"];

/** メッセージが上記の「戦闘不能」系キーワードを含む場合、倒れた本人と推定される名前を返す。 */
export function findDefeatedName(message: string, rosterNames: string[]): string | null {
  return findNameBeforeKeywords(message, rosterNames, DEFEAT_KEYWORDS);
}

/** メッセージに「必殺技」の語が含まれる場合、使用した本人と推定される名前を返す。 */
export function findSpecialMoveName(message: string, rosterNames: string[]): string | null {
  return findNameBeforeKeywords(message, rosterNames, ["必殺技"]);
}

/** メッセージ中の『...』(技名)があれば抽出する(カットイン演出の技名表示用、無ければnull)。 */
export function extractMoveName(message: string): string | null {
  const match = message.match(/『([^』]+)』/);
  return match ? match[1] : null;
}

/** ロースター1チーム分のカード表示(戦闘不能ならグレイアウト、直前に行動したら揺れる)。 */
function RosterTeam({
  characters,
  teamClassName,
  actingNames,
  defeatedNames,
  revealedCount,
}: {
  characters: Character[];
  teamClassName: string;
  actingNames: Set<string>;
  defeatedNames: Set<string>;
  revealedCount: number;
}) {
  return (
    <div className={`battle-roster__team ${teamClassName}`}>
      {characters.map((character) => {
        const isActing = actingNames.has(character.name);
        const isDefeated = defeatedNames.has(character.name);
        const className = [
          "battle-roster__card",
          isActing && "battle-roster__card--acting",
          isDefeated && "battle-roster__card--defeated",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            // 行動演出は毎回揺れを再生させたいため、行動したターンが変わるたびに
            // keyを変えて要素を再マウントし、CSSアニメーションを再生させる。
            key={isActing ? `${character.id}-turn-${revealedCount}` : character.id}
            className={className}
            title={character.name}
          >
            <div className="battle-roster__card-thumb">
              {character.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
                <img src={character.imageUrl} alt={character.name} />
              ) : (
                <span className="battle-arena__mini-card-placeholder">No Image</span>
              )}
            </div>
            <p className="battle-roster__card-name">{character.name}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function BattleLogViewer({
  entries,
  events = [],
  rosterA = [],
  rosterB = [],
  showRoster = true,
  onRevealedCountChange,
}: {
  entries: BattleLogEntry[];
  events?: BattleEventDetail[];
  rosterA?: Character[];
  rosterB?: Character[];
  /** falseの場合、ログ側のロースター表示(カード一覧)を省略する。 */
  showRoster?: boolean;
  /** ターンの開示件数が変わるたびに呼ばれる(親側でカードの演出に使う場合に指定)。 */
  onRevealedCountChange?: (revealedCount: number) => void;
}) {
  const turns = useMemo(() => groupByTurn(entries), [entries]);

  // 初期表示は先頭ターンのみ(ターンが1件も無ければ0のまま)。
  const [revealedCount, setRevealedCount] = useState(() => (turns.length > 0 ? 1 : 0));

  useEffect(() => {
    onRevealedCountChange?.(revealedCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCount]);

  // 2秒おきに自動で次のターンを開示する(全ターン開示済みなら何もしない)。
  useEffect(() => {
    if (revealedCount >= turns.length) {
      return;
    }
    const timer = setTimeout(() => {
      setRevealedCount((count) => Math.min(count + 1, turns.length));
    }, 2000);
    return () => clearTimeout(timer);
  }, [revealedCount, turns.length]);

  // ターンが開示されるたびに、末尾(最新のログ)が見える位置まで自動でスクロールする。
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [revealedCount]);

  const rosterNames = useMemo(
    () => [...rosterA, ...rosterB].map((character) => character.name),
    [rosterA, rosterB]
  );

  // 直前に開示されたターン(最新の1ターン分)のメッセージから「行動したキャラクター」を推定する。
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

  // これまでに開示された全メッセージから「戦闘不能になったキャラクター」を推定する(以降ずっとグレイアウト)。
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

  // イベントをターン番号ごとに振り分ける。`battleLog` に実在するターン番号にのみ
  // 紐付け、それ以外(`turn`が`null`、または`battleLog`に存在しないターン番号)は
  // 末尾の「演出」セクション(`tailEvents`)にまとめる。
  const { turnEventsMap, tailEvents } = useMemo(() => {
    const knownTurns = new Set(turns.map((group) => group.turn));
    const map = new Map<number, BattleEventDetail[]>();
    const tail: BattleEventDetail[] = [];
    for (const event of events) {
      if (event.turn !== null && knownTurns.has(event.turn)) {
        const list = map.get(event.turn);
        if (list) {
          list.push(event);
        } else {
          map.set(event.turn, [event]);
        }
      } else {
        tail.push(event);
      }
    }
    return { turnEventsMap: map, tailEvents: tail };
  }, [turns, events]);

  const visibleTurns = turns.slice(0, revealedCount);
  const remaining = turns.length - revealedCount;
  // 同じターン番号のブロックが(理論上)複数回出現しても、そのターンに紐づく
  // イベントは最初に出現したブロックの直後にのみ表示する(重複表示を防止)。
  const renderedEventTurns = new Set<number>();

  return (
    <div className="battle-log">
      {showRoster && (rosterA.length > 0 || rosterB.length > 0) && (
        <div className="battle-roster">
          <RosterTeam
            characters={rosterA}
            teamClassName="battle-roster__team--a"
            actingNames={actingNames}
            defeatedNames={defeatedNames}
            revealedCount={revealedCount}
          />
          <RosterTeam
            characters={rosterB}
            teamClassName="battle-roster__team--b"
            actingNames={actingNames}
            defeatedNames={defeatedNames}
            revealedCount={revealedCount}
          />
        </div>
      )}

      {turns.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>戦闘ログがありません。</p>
      ) : (
        <>
          <div className="battle-log__turns">
            {visibleTurns.map((group, index) => {
              const isFirstOccurrence = !renderedEventTurns.has(group.turn);
              if (isFirstOccurrence) {
                renderedEventTurns.add(group.turn);
              }
              const turnEvents = isFirstOccurrence ? turnEventsMap.get(group.turn) ?? [] : [];

              return (
                <div key={`${group.turn}-${index}`} className="battle-log__turn">
                  <p className="battle-log__turn-heading">ターン {group.turn}</p>
                  {group.messages.map((message, messageIndex) => (
                    <p key={messageIndex} className="battle-log__message">
                      {message}
                    </p>
                  ))}
                  {turnEvents.length > 0 && (
                    <div className="battle-log__turn-events">
                      {turnEvents.map((event, eventIndex) => (
                        <BattleEventCard key={eventIndex} event={event} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {remaining > 0 ? (
            <div className="battle-log__controls">
              <span className="battle-setup__spinner battle-log__auto-spinner" aria-hidden="true" />
              <span className="battle-log__remaining">残り {remaining} ターン(自動再生中)</span>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRevealedCount(turns.length)}
              >
                スキップ
              </button>
            </div>
          ) : (
            <p className="battle-log__done">戦闘終了。すべてのターンを表示しました。</p>
          )}
          <div ref={logEndRef} className="battle-log__end-marker" />
        </>
      )}

      {tailEvents.length > 0 && (
        <div className="battle-log__tail-events">
          <p className="battle-log__tail-events-heading">演出</p>
          <div className="battle-log__turn-events">
            {tailEvents.map((event, index) => (
              <BattleEventCard key={index} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
