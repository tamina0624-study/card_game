"use client";

/**
 * 必殺技(技名/説明/演出テキスト)の追加・編集UI。
 *
 * `PointAllocator` と同様、行の動的な追加・削除ができる完全制御コンポーネントとして実装する
 * (状態は親 `src/app/characters/new/page.tsx` が保持し、`specialMoves` / `onChange` のみを受け取る)。
 * 必殺技は任意項目のため、0件の状態も許容する。
 *
 * フォーム上は description/flavorText を空文字列で扱う(未入力を表現するため)。
 * API送信時に空文字列を `undefined` へ変換するのは呼び出し側(親ページ)の責務とする。
 */

export type SpecialMoveFormValue = {
  name: string;
  description: string;
  flavorText: string;
};

type SpecialMoveEditorProps = {
  specialMoves: SpecialMoveFormValue[];
  onChange: (specialMoves: SpecialMoveFormValue[]) => void;
};

export default function SpecialMoveEditor({ specialMoves, onChange }: SpecialMoveEditorProps) {
  function handleFieldChange(index: number, patch: Partial<SpecialMoveFormValue>) {
    onChange(specialMoves.map((move, i) => (i === index ? { ...move, ...patch } : move)));
  }

  function handleAdd() {
    onChange([...specialMoves, { name: "", description: "", flavorText: "" }]);
  }

  function handleRemove(index: number) {
    onChange(specialMoves.filter((_, i) => i !== index));
  }

  return (
    <div className="special-move-editor">
      {specialMoves.length === 0 && (
        <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
          必殺技は任意です。「+ 必殺技を追加」から登録できます(複数登録可)。
        </p>
      )}

      <div className="special-move-editor__rows">
        {specialMoves.map((move, index) => (
          <div className="special-move-editor__row card" key={index}>
            <div className="special-move-editor__row-header">
              <span>必殺技 {index + 1}</span>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => handleRemove(index)}
              >
                削除
              </button>
            </div>

            <div className="form-field">
              <label htmlFor={`special-move-name-${index}`}>技名</label>
              <input
                id={`special-move-name-${index}`}
                type="text"
                value={move.name}
                onChange={(event) => handleFieldChange(index, { name: event.target.value })}
                placeholder="技名(例: 紅蓮斬)"
              />
            </div>

            <div className="form-field">
              <label htmlFor={`special-move-description-${index}`}>説明</label>
              <textarea
                id={`special-move-description-${index}`}
                value={move.description}
                onChange={(event) => handleFieldChange(index, { description: event.target.value })}
                placeholder="技の効果・説明"
                rows={2}
              />
            </div>

            <div className="form-field">
              <label htmlFor={`special-move-flavor-${index}`}>演出テキスト</label>
              <textarea
                id={`special-move-flavor-${index}`}
                value={move.flavorText}
                onChange={(event) => handleFieldChange(index, { flavorText: event.target.value })}
                placeholder="発動時の演出テキスト"
                rows={2}
              />
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="button button-secondary" onClick={handleAdd}>
        + 必殺技を追加
      </button>
    </div>
  );
}
