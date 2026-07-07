/**
 * 静的アセット(背景画像・サンプルキャラクター画像・BGM/効果音)の配信元ベースURL。
 *
 * `public/backgrounds` `public/battle-backgrounds` `public/characters` `public/sound` は
 * もうNext.js自身の `public/` からは配信せず、スターサーバー
 * (`http://ss181301.stars.ne.jp/card_game/public`)から配信する
 * (Renderのディスクが一時的なため、画像・音声を安定して配信できる外部ホストへ移した)。
 *
 * `NEXT_PUBLIC_` プレフィックス付きのためクライアントコンポーネントのバンドルにも
 * ビルド時点の値がそのまま埋め込まれる(値はビルド時と実行時で変わらない前提)。
 */
export const ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "http://ss181301.stars.ne.jp/card_game/public"
).replace(/\/$/, "");

/** `path`(先頭スラッシュ付き、例: `/sound/BaseMusic.mp3`)を絶対URLに変換する。 */
export function assetUrl(path: string): string {
  return `${ASSET_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
