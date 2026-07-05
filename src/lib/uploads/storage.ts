/**
 * キャラクター画像アップロードの保存処理。
 *
 * docs/設計.md 0章「画像アップロードは実装時に設計する」/ 1.2「lib/uploads/storage.ts」を踏まえ、
 * 保存先はローカルディスク `public/uploads/characters/`(Next.jsの静的配信対象)とする。
 * モデレーションは行わない(開発指示書「確定事項」7番、将来課題)。
 *
 * 許容MIMEタイプ(png/jpeg/webp/gif)・サイズ上限(2MB)の検証に違反した場合は
 * {@link ImageValidationError} を投げる。呼び出し元(API Route Handler)はこのエラーを
 * 捕捉して400 Bad Requestとして扱うこと(`code` で違反理由を判別できる)。
 */

import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

/** アップロードを許容するMIMEタイプ。 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** アップロードファイルサイズの上限(2MB)。 */
export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

/** MIMEタイプごとに「元の拡張子」として許容する拡張子一覧(小文字比較)。 */
const EXTENSIONS_BY_MIME_TYPE: Record<AllowedImageMimeType, readonly string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

/** 元のファイル名から妥当な拡張子を取得できなかった場合に使うMIMEタイプ既定の拡張子。 */
const DEFAULT_EXTENSION_BY_MIME_TYPE: Record<AllowedImageMimeType, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * 画像保存先ディレクトリ(`public/uploads/characters/`)。
 *
 * 注意: `next start`(本番サーバー)は`public/`配下のファイル一覧を起動時に
 * 一度だけスキャンするため、起動後にここへ書き込まれたファイルは静的配信
 * (`/uploads/characters/...`への直接アクセス)の対象にならず404になる。
 * そのため配信は `app/api/uploads/characters/[filename]/route.ts` 経由で行う
 * (`next.config.ts` のrewriteで `/uploads/characters/:path*` をそちらへ転送)。
 */
export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "characters");

/**
 * MIMEタイプ・サイズ検証に違反した場合に投げるエラー。
 * `code` で呼び出し元(API Route Handler)が違反理由を判別できるようにする
 * (`lib/characters/repository.ts` の `CharacterInUseError` と同様の設計方針)。
 */
export class ImageValidationError extends Error {
  readonly code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE";

  constructor(code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE", message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

function isAllowedMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * アップロードされたファイルの元の拡張子を取得する。
 * MIMEタイプと矛盾しない(=許容リストに含まれる)場合のみ元の拡張子を採用し、
 * 拡張子が無い・MIMEタイプと矛盾する(例: 不審な二重拡張子)場合はMIMEタイプ既定の
 * 拡張子にフォールバックする。
 */
function resolveExtension(originalFileName: string, mimeType: AllowedImageMimeType): string {
  const originalExtension = path.extname(originalFileName).toLowerCase();
  const allowedExtensions = EXTENSIONS_BY_MIME_TYPE[mimeType];
  if (originalExtension && allowedExtensions.includes(originalExtension)) {
    return originalExtension;
  }
  return DEFAULT_EXTENSION_BY_MIME_TYPE[mimeType];
}

/**
 * キャラクター画像を検証・保存し、公開URLを返す。
 *
 * - MIMEタイプ(`file.type`)が {@link ALLOWED_IMAGE_MIME_TYPES} のいずれでもない場合、
 *   `code: "INVALID_FILE_TYPE"` の {@link ImageValidationError} を投げる。
 * - ファイルサイズが {@link MAX_IMAGE_SIZE_BYTES}(2MB)を超える場合、
 *   `code: "FILE_TOO_LARGE"` の {@link ImageValidationError} を投げる。
 * - 検証をパスした場合、uuidで生成したファイル名(元の拡張子を保持)で
 *   `public/uploads/characters/` に書き込み、`{ url: "/uploads/characters/<ファイル名>" }` を返す。
 */
export async function saveCharacterImage(file: File): Promise<{ url: string }> {
  if (!isAllowedMimeType(file.type)) {
    throw new ImageValidationError(
      "INVALID_FILE_TYPE",
      "対応していないファイル形式です。png/jpeg/webp/gif形式の画像のみアップロードできます。"
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ImageValidationError(
      "FILE_TOO_LARGE",
      "ファイルサイズが上限(2MB)を超えています。"
    );
  }

  const extension = resolveExtension(file.name, file.type);
  const fileName = `${uuidv4()}${extension}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), buffer);

  return { url: `/uploads/characters/${fileName}` };
}
