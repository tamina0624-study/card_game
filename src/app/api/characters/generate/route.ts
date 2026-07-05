/**
 * `POST /api/characters/generate` のRoute Handler。
 *
 * キャラクター作成画面で、ユーザーが入力した「雰囲気・イメージ」の自由記述から
 * AIにキャラクター名・説明・パラメーター・必殺技を考案してもらう
 * (画像生成は行わない。画像は各ユーザーが自分で用意しアップロードする)。
 *
 * SQLiteへのアクセスはないため `runtime = "nodejs"` の明示は不要(既定のNode.js
 * ランタイムでAnthropic/OpenAI SDKを利用する)。
 */

import { NextRequest, NextResponse } from "next/server";
import { CharacterGenerationError, generateCharacterConcept } from "@/lib/characters/aiGenerate";

/** リクエストボディから `concept`(トリム済み・空でない文字列)を取り出す。不正な場合は `null`。 */
function parseConcept(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("concept" in body)) {
    return null;
  }
  const concept = (body as Record<string, unknown>).concept;
  if (typeof concept !== "string") {
    return null;
  }
  const trimmed = concept.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 「雰囲気・イメージ」からキャラクター案(名前・説明・パラメーター・必殺技)を生成する。
 * `concept` が空・不正な場合は400、AI呼び出し・応答検証に失敗した場合は502を返す。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です。" },
      { status: 400 }
    );
  }

  const concept = parseConcept(body);
  if (!concept) {
    return NextResponse.json(
      { error: "雰囲気・イメージを入力してください。" },
      { status: 400 }
    );
  }

  try {
    const result = await generateCharacterConcept(concept);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof CharacterGenerationError) {
      return NextResponse.json(
        { error: "AIによるキャラクター案の生成に失敗しました。しばらくしてから再度お試しください。" },
        { status: 502 }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `AI呼び出し中にエラーが発生しました: ${message}` },
      { status: 502 }
    );
  }
}
