"use client";

/**
 * ユーザー登録フォーム(クライアントコンポーネント)。
 *
 * ユーザー名のみを入力させ、パスワードはPHPブリッジ側(`generate_random_password`)が
 * 自動生成する(追加機能20260707.md「ユーザー登録機能」)。登録成功時は
 * `POST /api/auth/register` がセッションCookieを発行済み(自動ログイン状態)なので、
 * 生成されたパスワードをこの画面で一度だけ表示し、ストーリーへの導線を出す。
 */

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type RegisterResult = {
  user: { id: number; username: string; createdAt: string };
  password: string;
};

export default function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username.trim().length === 0) {
      setError("ユーザー名を入力してください。");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "登録に失敗しました。";
        setError(message);
        return;
      }

      setResult(data as RegisterResult);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="card auth-card">
        <h2 style={{ marginBottom: "1rem" }}>登録が完了しました</h2>
        <p style={{ marginBottom: "1rem" }}>
          ログイン用のパスワードは以下の通りです。<strong>この画面を離れると再表示されません</strong>
          ので必ず控えてください(忘れた場合はログイン画面の「パスワードを忘れた方」からいつでも再確認できます)。
        </p>
        <dl className="auth-result">
          <dt>ユーザー名</dt>
          <dd>{result.user.username}</dd>
          <dt>パスワード</dt>
          <dd className="auth-result__password">{result.password}</dd>
        </dl>
        <div className="button-group">
          <Link href="/stories" className="button button-primary">
            ストーリーを見にいく
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card auth-card">
      {error && (
        <div className="form-error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="form-field">
        <label htmlFor="register-username">ユーザー名 *</label>
        <input
          id="register-username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="例: たろう"
          maxLength={50}
          required
        />
      </div>

      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        パスワードの入力は不要です。登録するとアプリがランダムな10文字のパスワードを自動発行します。
      </p>

      <div className="button-group">
        <button
          type="submit"
          className="button button-primary"
          disabled={submitting || username.trim().length === 0}
        >
          {submitting ? "登録中..." : "登録する"}
        </button>
        <Link href="/login" className="button button-secondary">
          ログインはこちら
        </Link>
      </div>
    </form>
  );
}
