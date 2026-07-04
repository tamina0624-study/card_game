"use client";

/**
 * キャラクターのパラメーター(名前/値)配分UI。
 *
 * 行の動的な追加・削除ができる完全制御コンポーネント(controlled component)として実装し、
 * 状態そのものは親(`src/app/characters/new/page.tsx`)が保持する
 * (`parameters` / `onChange` のみを受け取り、内部にstateを持たない)。
 *
 * 現在の合計ポイント・残りポイントをリアルタイムに表示し、合計が {@link MAX_TOTAL_POINTS}
 * を超えている場合は警告表示する(実際の送信ボタンの無効化は、同じ合計値を親が
 * 再計算して判定する。`MAX_TOTAL_POINTS` をここからexportし、親と単一の定数を共有する)。
 */

import type { CharacterParameterInput } from "@/lib/types";

/** キャラクター1体に許容する合計ポイント(開発指示書「ユーザーには100ポイントが与えられる」)。 */
export const MAX_TOTAL_POINTS = 100;

type PointAllocatorProps = {
  parameters: CharacterParameterInput[];
  onChange: (parameters: CharacterParameterInput[]) => void;
};

export default function PointAllocator({ parameters, onChange }: PointAllocatorProps) {
  const total = parameters.reduce(
    (sum, parameter) => sum + (Number.isFinite(parameter.value) ? parameter.value : 0),
    0
  );
  const remaining = MAX_TOTAL_POINTS - total;
  const isOverLimit = total > MAX_TOTAL_POINTS;

  function handleNameChange(index: number, name: string) {
    onChange(parameters.map((parameter, i) => (i === index ? { ...parameter, name } : parameter)));
  }

  function handleValueChange(index: number, rawValue: string) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    const value = Number.isFinite(parsed) ? parsed : 0;
    onChange(parameters.map((parameter, i) => (i === index ? { ...parameter, value } : parameter)));
  }

  function handleAdd() {
    onChange([...parameters, { name: "", value: 0 }]);
  }

  function handleRemove(index: number) {
    onChange(parameters.filter((_, i) => i !== index));
  }

  return (
    <div className="point-allocator">
      <div
        className={
          isOverLimit ? "point-allocator__summary point-allocator__summary--over" : "point-allocator__summary"
        }
      >
        <span>
          合計 {total} / {MAX_TOTAL_POINTS} pt
        </span>
        <span>残り {remaining} pt</span>
      </div>

      {isOverLimit && (
        <p className="form-error" role="alert">
          パラメーターの合計が{MAX_TOTAL_POINTS}ポイントを超えています。値を調整してください。
        </p>
      )}

      <div className="point-allocator__rows">
        {parameters.map((parameter, index) => (
          <div className="point-allocator__row" key={index}>
            <input
              type="text"
              value={parameter.name}
              onChange={(event) => handleNameChange(index, event.target.value)}
              placeholder="パラメーター名(例: 力)"
              aria-label={`パラメーター名 ${index + 1}`}
            />
            <input
              type="number"
              value={parameter.value}
              onChange={(event) => handleValueChange(index, event.target.value)}
              min={0}
              max={100}
              aria-label={`パラメーター値 ${index + 1}`}
            />
            <button
              type="button"
              className="button button-secondary point-allocator__remove"
              onClick={() => handleRemove(index)}
              disabled={parameters.length <= 1}
              title={parameters.length <= 1 ? "パラメーターは最低1件必要です" : undefined}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="button button-secondary" onClick={handleAdd}>
        + パラメーターを追加
      </button>
    </div>
  );
}
