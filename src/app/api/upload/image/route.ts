export const runtime = "nodejs";

/**
 * `POST /api/upload/image` (キャラクター画像アップロード) のRoute Handler。
 *
 * `multipart/form-data` で受け取った `file` フィールドを
 * `saveCharacterImage`(`lib/uploads/storage.ts`)に渡し、検証・保存を行う。
 * ローカルファイルシステムへ書き込むため `runtime = "nodejs"` を明示する
 * (docs/設計.md 1.1「SQLiteアクセスを行うAPI Routeには runtime = "nodejs" を明示」と同様の方針)。
 */

import { NextRequest, NextResponse } from "next/server";
import { ImageValidationError, saveCharacterImage } from "@/lib/uploads/storage";

/**
 * 画像をアップロードする。
 * `file` フィールドが無い/ファイルでない場合は400、MIMEタイプ・サイズ検証に失敗した場合も400、
 * 成功した場合は200で `{ url }` を返す(docs/設計.md 3章参照)。
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "リクエストがmultipart/form-dataとして不正です。" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "画像ファイル(file)を指定してください。" },
      { status: 400 }
    );
  }

  try {
    const result = await saveCharacterImage(file);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
