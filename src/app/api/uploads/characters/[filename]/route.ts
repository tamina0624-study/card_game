export const runtime = "nodejs";

/**
 * `GET /api/uploads/characters/[filename]` (アップロード済みキャラクター画像の配信)。
 *
 * `next start`(本番サーバー)は `public/` 配下のファイル一覧を起動時に一度だけ
 * スキャンするため、起動後に書き込まれたアップロード画像は静的配信の対象外となり
 * 404になる(`lib/uploads/storage.ts` のUPLOAD_DIRコメント参照)。
 * このRoute Handlerがリクエストのたびにファイルシステムを直接読むことで、
 * 起動後に追加された画像も配信できるようにする。
 * `next.config.ts` のrewriteで `/uploads/characters/:filename` からここへ転送される。
 */

import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { UPLOAD_DIR } from "@/lib/uploads/storage";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename: rawFilename } = await params;
  // path.basenameでパストラバーサル(`../`等)を無害化する。
  const filename = path.basename(rawFilename);
  const contentType = CONTENT_TYPE_BY_EXTENSION[path.extname(filename).toLowerCase()];

  if (!contentType) {
    return NextResponse.json({ error: "対応していないファイル形式です。" }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(path.join(UPLOAD_DIR, filename));
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "画像が見つかりません。" }, { status: 404 });
  }
}
