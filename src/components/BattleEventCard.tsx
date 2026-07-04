/**
 * 必殺技演出イベント1件をハイライト表示するカード。
 *
 * `BattleDetail.events[]`(`@/lib/types` の `BattleEventDetail`、
 * `{turn, type, character, effect, raw}`)を1件受け取り、通常の戦闘ログ
 * (`BattleLogViewer` のターンブロック)とは視覚的に区別されるカードとして
 * `character`(必殺技使用キャラクター名)・`effect`(演出内容)を表示する。
 *
 * `raw` はAIが返した演出イベントオブジェクト全体(開発指示書.md「演出」節の
 * 例: `{ effectType, camera, message }` 等、自由記述のフィールドを含みうる)を
 * 保持している。`type`/`character`/`effect` は既に専用の見た目で表示済みのため、
 * それ以外の追加キーのみを `キー: 値` 形式で汎用的に列挙する。これにより
 * `raw` のキー構成がAIの出力ごとに変わっても(`effectType`/`camera`/`message`
 * 以外の未知のキーが来ても、あるいは一部キーが無くても)表示が壊れない。
 */

import type { BattleEventDetail } from "@/lib/types";

/** 通常の演出イベントで既に専用表示している(=汎用列挙からは除外する)キー。 */
const DISPLAYED_KEYS = new Set(["type", "character", "effect"]);

/** 追加キーの値を人間が読める1行の文字列に変換する(型が何であっても壊れないようにする)。 */
function formatExtraValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(未設定)";
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : "(空文字)";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type BattleEventCardProps = {
  event: BattleEventDetail;
};

export default function BattleEventCard({ event }: BattleEventCardProps) {
  const raw = event.raw ?? {};
  const extraEntries = Object.entries(raw).filter(([key]) => !DISPLAYED_KEYS.has(key));

  return (
    <div className="battle-event-card" role="note">
      <div className="battle-event-card__header">
        <span className="battle-event-card__badge">必殺技演出</span>
        {event.turn !== null && (
          <span className="battle-event-card__turn">ターン {event.turn}</span>
        )}
      </div>

      <p className="battle-event-card__character">
        {event.character ?? "(使用キャラクター不明)"}
      </p>
      <p className="battle-event-card__effect">{event.effect ?? "(演出内容の記述なし)"}</p>

      {extraEntries.length > 0 && (
        <dl className="battle-event-card__extra">
          {extraEntries.map(([key, value]) => (
            <div key={key} className="battle-event-card__extra-row">
              <dt>{key}</dt>
              <dd>{formatExtraValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
