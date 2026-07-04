"use client";

/**
 * デッキ作成/編集フォーム(クライアントコンポーネント)。
 *
 * `src/app/decks/new/page.tsx`(作成)と `src/app/decks/[id]/edit/page.tsx`
 * (編集)の両方から使う共通フォーム。`mode` によって送信先が変わるのみで、
 * フィールド構成・バリデーション表示は完全に共通:
 * - デッキ名/作成者名の入力欄
 * - `DeckBuilder`(キャラクター選択+前衛/控えトグルUI、ちょうど8体の選択・
 *   「前衛 x/4・控え y/4」のカウント表示を担当)
 *
 * クライアント側で前衛/控えがちょうど4/4になっていない場合は送信ボタンを無効化する。
 * 作成時は `POST /api/decks`、編集時は `PUT /api/decks/:id` へ
 * `{ name, ownerName, cards: [{characterId, role}] }` を送信し、サーバー側バリデーション
 * エラー(`{ error, details }`)があれば画面に表示、成功時は `/decks` へリダイレクトする。
 */

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DeckBuilder, { DECK_SIZE, FRONT_SIZE, BENCH_SIZE } from "@/components/DeckBuilder";
import type { Deck, DeckCardInput, DeckInput } from "@/lib/types";

/** APIエラーレスポンスの `details`(zod issues)1件分。 */
type ApiErrorIssue = { message?: unknown };

export type DeckFormProps =
  | { mode: "create" }
  | { mode: "edit"; deckId: number; initialDeck: Deck };

/** `Deck`(front/bench各体のキャラクター全情報)を `DeckBuilder` が扱う `DeckCardInput[]` へ変換する。 */
function toInitialCards(deck: Deck): DeckCardInput[] {
  return [
    ...deck.front.map((character) => ({ characterId: character.id, role: "front" as const })),
    ...deck.bench.map((character) => ({ characterId: character.id, role: "bench" as const })),
  ];
}

export default function DeckForm(props: DeckFormProps) {
  const router = useRouter();
  const initial = props.mode === "edit" ? props.initialDeck : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [cards, setCards] = useState<DeckCardInput[]>(initial ? toInitialCards(initial) : []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const frontCount = cards.filter((card) => card.role === "front").length;
  const benchCount = cards.filter((card) => card.role === "bench").length;
  const isNameValid = name.trim().length > 0;
  const isRoleCountValid = frontCount === FRONT_SIZE && benchCount === BENCH_SIZE;
  const canSubmit = !submitting && isNameValid && isRoleCountValid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setFieldErrors([]);

    if (!isNameValid) {
      setSubmitError("デッキ名を入力してください。");
      return;
    }
    if (!isRoleCountValid) {
      setSubmitError(`前衛${FRONT_SIZE}体・控え${BENCH_SIZE}体になるようにキャラクターを選択してください。`);
      return;
    }

    const payload: DeckInput = {
      name: name.trim(),
      ownerName: ownerName.trim() || undefined,
      cards,
    };

    setSubmitting(true);
    try {
      const endpoint = props.mode === "edit" ? `/api/decks/${props.deckId}` : "/api/decks";
      const method = props.mode === "edit" ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const errorRecord = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const message =
          errorRecord && typeof errorRecord.error === "string"
            ? errorRecord.error
            : `デッキの${props.mode === "edit" ? "更新" : "作成"}に失敗しました。`;
        setSubmitError(message);

        const details = errorRecord?.details;
        if (Array.isArray(details)) {
          const messages = (details as ApiErrorIssue[])
            .map((issue) => (typeof issue.message === "string" ? issue.message : null))
            .filter((message): message is string => message !== null);
          setFieldErrors(messages);
        }
        return;
      }

      router.push("/decks");
    } catch {
      setSubmitError("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {submitError && (
        <div className="form-error-banner" role="alert">
          {submitError}
        </div>
      )}
      {fieldErrors.length > 0 && (
        <ul className="form-error-list">
          {fieldErrors.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>基本情報</h2>

        <div className="form-field">
          <label htmlFor="deck-name">デッキ名 *</label>
          <input
            id="deck-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: 紅蓮の軍勢"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="deck-owner-name">作成者名</label>
          <input
            id="deck-owner-name"
            type="text"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            placeholder="例: たみな"
          />
        </div>
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>
          キャラクター選択(ちょうど{DECK_SIZE}体・前衛{FRONT_SIZE}/控え{BENCH_SIZE})
        </h2>
        <DeckBuilder cards={cards} onChange={setCards} />
      </section>

      <div className="button-group">
        <button type="submit" className="button button-primary" disabled={!canSubmit}>
          {submitting
            ? props.mode === "edit"
              ? "保存中..."
              : "作成中..."
            : props.mode === "edit"
              ? "変更を保存"
              : "デッキを作成"}
        </button>
        <Link href="/decks" className="button button-secondary">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
