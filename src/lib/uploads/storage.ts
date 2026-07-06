/**
 * キャラクター画像アップロードの保存処理。
 *
 * 保存先はもうローカルディスク(`public/uploads/characters/`)ではなく、
 * PHPブリッジ(`php/upload.php`)へmultipart/form-dataのまま転送し、
 * スターサーバー側の `public_html/card_game/public/uploads/characters/` に保存する
 * (Renderのディスクが一時的で、再デプロイ時にアップロード画像が消える問題への対応)。
 * MIME/サイズ検証(png/jpeg/webp/gif、2MB上限)はブリッジ側でも行われるが、
 * 早期にエラーを返せるようここでも同じ検証を行う。
 *
 * 呼び出し元(API Route Handler)は {@link ImageValidationError} を捕捉して
 * 400 Bad Requestとして扱うこと(`code` で違反理由を判別できる)。
 */

import { callBridgeUpload } from "@/lib/bridge/client";

/** アップロードを許容するMIMEタイプ。 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** アップロードファイルサイズの上限(2MB)。 */
export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * MIMEタイプ・サイズ検証に違反した場合に投げるエラー。
 * `code` で呼び出し元(API Route Handler)が違反理由を判別できるようにする。
 */
export class ImageValidationError extends Error {
  readonly code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE";

  constructor(code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE", message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * キャラクター画像を検証し、PHPブリッジ経由でスターサーバーへ保存して公開URL(絶対URL)を返す。
 *
 * - MIMEタイプ(`file.type`)が {@link ALLOWED_IMAGE_MIME_TYPES} のいずれでもない場合、
 *   `code: "INVALID_FILE_TYPE"` の {@link ImageValidationError} を投げる。
 * - ファイルサイズが {@link MAX_IMAGE_SIZE_BYTES}(2MB)を超える場合、
 *   `code: "FILE_TOO_LARGE"` の {@link ImageValidationError} を投げる。
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

  const formData = new FormData();
  formData.set("file", file);

  return callBridgeUpload<{ url: string }>("upload.php", formData);
}
