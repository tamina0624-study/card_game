"use client";

/**
 * ルートエラーバウンダリ。
 *
 * `lib/bridge/client.ts` 経由のPHPブリッジ呼び出し(未デプロイ・接続不可・応答が
 * JSONでない等)がページのサーバーコンポーネント内で失敗した場合、Next.jsの
 * デフォルトエラー画面(素っ気ない/開発時は生のスタックトレース)の代わりにここを表示する。
 * 本番ではサーバー側エラーの詳細プロパティはクライアントへ渡らないが、`message` は
 * 保持されるため、`lib/bridge/client.ts` 側で分かりやすい日本語メッセージにしてある。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-bg">
      <div className="page-bg__content">
        <div className="card" style={{ maxWidth: 640, margin: "48px auto", textAlign: "center" }}>
          <h1 style={{ marginBottom: 12 }}>エラーが発生しました</h1>
          <p style={{ color: "var(--muted)", marginBottom: 24, whiteSpace: "pre-wrap" }}>
            {error.message || "予期しないエラーが発生しました。"}
          </p>
          <button type="button" className="button button-primary" onClick={() => reset()}>
            再試行
          </button>
        </div>
      </div>
    </div>
  );
}
