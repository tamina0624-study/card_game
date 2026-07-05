"use client";

/**
 * キャラクター作成/編集フォーム(クライアントコンポーネント)。
 *
 * `src/app/characters/new/page.tsx`(作成)と `src/app/characters/[id]/edit/page.tsx`
 * (編集)の両方から使う共通フォーム。`mode` によって送信先が変わるのみで、
 * フィールド構成・バリデーション表示は完全に共通:
 * - name/description入力欄
 * - 画像アップロード欄(ファイル選択時に `POST /api/upload/image` へ送信し、
 *   返却された `url` をプレビュー表示・フォーム状態(`imageUrl`)に保持する)
 * - `PointAllocator`(パラメーター配分UI、100ポイント超過時は送信を無効化)
 * - `SpecialMoveEditor`(必殺技の追加・編集UI)
 * - (`mode === "create"` のみ)「AIにキャラクター案を考えてもらう」欄。自由記述の
 *   「雰囲気・イメージ」を `POST /api/characters/generate` へ送信し、AIが考案した
 *   name/description/parameters/specialMoves で各入力欄を上書きする(画像は対象外、
 *   ユーザー自身が用意する)。生成後もユーザーは自由に編集できる。
 *
 * 作成時は `POST /api/characters`、編集時は `PUT /api/characters/:id` へ送信し、
 * APIから返るバリデーションエラー(`{ error, details }`)を画面に表示する。
 * 成功時(201/200)は `/characters` へリダイレクトする。
 */

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PointAllocator, { MAX_TOTAL_POINTS } from "@/components/PointAllocator";
import SpecialMoveEditor, { type SpecialMoveFormValue } from "@/components/SpecialMoveEditor";
import type { Character, CharacterInput, CharacterParameterInput } from "@/lib/types";

/** APIエラーレスポンスの `details`(zod issues)1件分。 */
type ApiErrorIssue = { message?: unknown };

export type CharacterFormProps =
  | { mode: "create" }
  | { mode: "edit"; characterId: number; initialCharacter: Character };

export default function CharacterForm(props: CharacterFormProps) {
  const router = useRouter();
  const initial = props.mode === "edit" ? props.initialCharacter : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [parameters, setParameters] = useState<CharacterParameterInput[]>(
    initial && initial.parameters.length > 0
      ? initial.parameters.map((parameter) => ({ name: parameter.name, value: parameter.value }))
      : [{ name: "", value: 0 }]
  );
  const [specialMoves, setSpecialMoves] = useState<SpecialMoveFormValue[]>(
    initial
      ? initial.specialMoves.map((move) => ({
          name: move.name,
          description: move.description ?? "",
          flavorText: move.flavorText ?? "",
        }))
      : []
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const [concept, setConcept] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const totalPoints = parameters.reduce(
    (sum, parameter) => sum + (Number.isFinite(parameter.value) ? parameter.value : 0),
    0
  );
  const isOverLimit = totalPoints > MAX_TOTAL_POINTS;
  const isNameValid = name.trim().length > 0;
  const canSubmit = !submitting && !imageUploading && isNameValid && !isOverLimit;

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImageError(null);
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload/image", { method: "POST", body: formData });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "画像のアップロードに失敗しました。";
        setImageError(message);
        return;
      }

      const url = data && typeof data === "object" && "url" in data ? (data as { url: unknown }).url : null;
      if (typeof url === "string") {
        setImageUrl(url);
      }
    } catch {
      setImageError("画像のアップロード中に通信エラーが発生しました。");
    } finally {
      setImageUploading(false);
      // 同じファイルを再選択してもonChangeが発火するようにリセットする
      event.target.value = "";
    }
  }

  function handleRemoveImage() {
    setImageUrl(null);
  }

  async function handleGenerate() {
    if (concept.trim().length === 0) {
      setGenerateError("雰囲気・イメージを入力してください。");
      return;
    }

    setGenerateError(null);
    setGenerating(true);
    try {
      const response = await fetch("/api/characters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: concept.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "AIによるキャラクター案の生成に失敗しました。";
        setGenerateError(message);
        return;
      }

      const result = data as {
        name: string;
        description: string;
        parameters: { name: string; value: number }[];
        specialMoves: { name: string; description?: string; flavorText?: string }[];
      };

      setName(result.name);
      setDescription(result.description);
      setParameters(result.parameters.map((parameter) => ({ name: parameter.name, value: parameter.value })));
      setSpecialMoves(
        result.specialMoves.map((move) => ({
          name: move.name,
          description: move.description ?? "",
          flavorText: move.flavorText ?? "",
        }))
      );
    } catch {
      setGenerateError("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setFieldErrors([]);

    if (!isNameValid) {
      setSubmitError("キャラクター名を入力してください。");
      return;
    }
    if (isOverLimit) {
      setSubmitError(`パラメーターの合計が${MAX_TOTAL_POINTS}ポイントを超えています。`);
      return;
    }

    const payload: CharacterInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl ?? undefined,
      parameters: parameters
        .filter((parameter) => parameter.name.trim().length > 0)
        .map((parameter) => ({
          name: parameter.name.trim(),
          value: Number.isFinite(parameter.value) ? parameter.value : 0,
        })),
      specialMoves: specialMoves
        .filter((move) => move.name.trim().length > 0)
        .map((move) => ({
          name: move.name.trim(),
          description: move.description.trim() || undefined,
          flavorText: move.flavorText.trim() || undefined,
        })),
    };

    setSubmitting(true);
    try {
      const endpoint = props.mode === "edit" ? `/api/characters/${props.characterId}` : "/api/characters";
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
            : `キャラクターの${props.mode === "edit" ? "更新" : "作成"}に失敗しました。`;
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

      router.push("/characters");
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

      {props.mode === "create" && (
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>AIにキャラクター案を考えてもらう</h2>
          <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
            好きな雰囲気やイメージを入力すると、AIが名前・説明・パラメーター・必殺技の案を考えて下記の入力欄に反映します(画像は含まれないため、別途ご自身で用意してアップロードしてください)。生成後も内容は自由に編集できます。
          </p>

          <div className="form-field">
            <label htmlFor="character-concept">雰囲気・イメージ</label>
            <textarea
              id="character-concept"
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              rows={3}
              placeholder="例: 氷の国から来た寡黙な剣士。仲間思いだが戦いになると冷酷になる。"
              disabled={generating}
            />
          </div>

          {generateError && (
            <p className="form-error" role="alert">
              {generateError}
            </p>
          )}

          <button type="button" className="button button-secondary" onClick={handleGenerate} disabled={generating}>
            {generating ? "生成中..." : "AIに考えてもらう"}
          </button>
        </section>
      )}

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>基本情報</h2>

        <div className="form-field">
          <label htmlFor="character-name">キャラクター名 *</label>
          <input
            id="character-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: 紅蓮の剣士アレン"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="character-description">説明</label>
          <textarea
            id="character-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="キャラクターの説明・設定"
          />
        </div>

        <div className="form-field">
          <label htmlFor="character-image">キャラクター画像</label>
          <input
            id="character-image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleImageChange}
            disabled={imageUploading}
          />
          {imageUploading && <p style={{ color: "var(--muted)" }}>アップロード中...</p>}
          {imageError && (
            <p className="form-error" role="alert">
              {imageError}
            </p>
          )}
          {imageUrl && (
            <div className="character-image-preview">
              {/* eslint-disable-next-line @next/next/no-img-element -- アップロード直後のプレビュー表示のため */}
              <img src={imageUrl} alt="アップロードされた画像のプレビュー" />
              <button type="button" className="button button-secondary" onClick={handleRemoveImage}>
                画像を削除
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>パラメーター(合計{MAX_TOTAL_POINTS}ポイントまで)</h2>
        <PointAllocator parameters={parameters} onChange={setParameters} />
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>必殺技</h2>
        <SpecialMoveEditor specialMoves={specialMoves} onChange={setSpecialMoves} />
      </section>

      <div className="button-group">
        <button type="submit" className="button button-primary" disabled={!canSubmit}>
          {submitting
            ? props.mode === "edit"
              ? "保存中..."
              : "作成中..."
            : props.mode === "edit"
              ? "変更を保存"
              : "キャラクターを作成"}
        </button>
        <Link href="/characters" className="button button-secondary">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
