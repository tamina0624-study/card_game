/**
 * PHPブリッジ(MySQLへのHTTP経由アクセス層、`php/` 配下)への共通クライアント。
 *
 * `PHP_BRIDGE_URL`(例: http://ss181301.stars.ne.jp/card_game/php)配下の
 * 各エンドポイント(characters.php/decks.php/battles.php/upload.php)を `X-API-Key` 付きで
 * 呼び出す。エラー時はPHP側が返す `{ error, code, ... }` を保持した {@link BridgeError} を
 * 投げる。呼び出し元(各リポジトリの repository.ts)はこれを捕捉し、`code` に応じて
 * `CharacterInUseError` 等の既存の独自例外を再構築する。
 */

function bridgeUrl(): string {
  const base = process.env.PHP_BRIDGE_URL;
  if (!base) {
    throw new Error("環境変数 PHP_BRIDGE_URL が設定されていません。");
  }
  return base.replace(/\/$/, "");
}

function apiKey(): string {
  const key = process.env.PHP_BRIDGE_API_KEY;
  if (!key) {
    throw new Error("環境変数 PHP_BRIDGE_API_KEY が設定されていません。");
  }
  return key;
}

/** PHPブリッジがエラーを返した場合に投げられる例外。 */
export class BridgeError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** PHP側のエラーレスポンスボディ全体(`characterId` 等の追加フィールドを含みうる)。 */
  readonly details: Record<string, unknown> | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "BridgeError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type CallBridgeOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

function buildQueryString(query: CallBridgeOptions["query"]): string {
  if (!query) {
    return "";
  }
  const params = Object.entries(query).filter(([, value]) => value !== undefined);
  if (params.length === 0) {
    return "";
  }
  return (
    "?" +
    params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")
  );
}

/**
 * PHPブリッジ以外(ホスティングの404ページ・PHPの致命的エラーが吐くHTML等)が
 * 返ってきた場合、素の `JSON.parse` は `SyntaxError` を投げてしまい原因が分かりにくい。
 * ここで捕捉し、`status`/本文冒頭を含む {@link BridgeError} に変換する
 * (`code: "INVALID_JSON_RESPONSE"` は呼び出し元の「404=not found」判定と衝突しないよう
 * 専用の値にしている。`repository.ts` 側の404判定は `code === null` も条件に含めること)。
 */
async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BridgeError(
      `PHPブリッジからJSON以外の応答が返されました(status=${response.status}, url=${response.url})。` +
        `ブリッジが未デプロイ、URL設定が誤っている、またはPHP側でエラーが発生している可能性があります。`,
      response.status,
      "INVALID_JSON_RESPONSE",
      { rawBodyPreview: text.slice(0, 500) }
    );
  }
}

function toBridgeError(status: number, data: unknown): BridgeError {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const message =
    record && typeof record.error === "string"
      ? record.error
      : `PHPブリッジ呼び出しに失敗しました(status=${status})。`;
  const code = record && typeof record.code === "string" ? record.code : null;
  return new BridgeError(message, status, code, record);
}

/**
 * PHPブリッジのエンドポイント(例: `"characters.php"`)を呼び出し、JSONレスポンスを返す。
 * `204`(本文なし)の場合は `null` を返す。
 */
export async function callBridge<T>(path: string, options: CallBridgeOptions = {}): Promise<T> {
  const response = await fetch(`${bridgeUrl()}/${path}${buildQueryString(options.query)}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey(),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (response.status === 204) {
    return null as T;
  }

  const data = await parseJsonBody(response);
  if (!response.ok) {
    throw toBridgeError(response.status, data);
  }
  return data as T;
}

/** 画像アップロード専用: `multipart/form-data` をそのままPHPブリッジ(`upload.php`)へ転送する。 */
export async function callBridgeUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${bridgeUrl()}/${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey(),
    },
    body: formData,
    cache: "no-store",
  });

  const data = await parseJsonBody(response);
  if (!response.ok) {
    throw toBridgeError(response.status, data);
  }
  return data as T;
}
