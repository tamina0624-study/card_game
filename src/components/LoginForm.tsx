"use client";

/**
 * ログインフォーム(クライアントコンポーネント)。
 *
 * ユーザー名・パスワードでログインする。パスワードはアプリが自動生成したものであり
 * ユーザーが記憶しづらいことを踏まえ、「パスワードを忘れた方」から
 * `POST /api/auth/recover`(ユーザー名だけで平文パスワードを再確認できる問い合わせ機能、
 * 追加機能20260707.md参照)を呼び出せるようにする。
 */

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showRecover, setShowRecover] = useState(false);
  const [recoverUsername, setRecoverUsername] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [recoveredPassword, setRecoveredPassword] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username.trim().length === 0 || password.length === 0) {
      setError("ユーザー名とパスワードを入力してください。");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "ログインに失敗しました。";
        setError(message);
        return;
      }

      router.push("/stories");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoverUsername.trim().length === 0) {
      setRecoverError("ユーザー名を入力してください。");
      return;
    }

    setRecoverError(null);
    setRecoveredPassword(null);
    setRecovering(true);
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: recoverUsername.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "パスワードの問い合わせに失敗しました。";
        setRecoverError(message);
        return;
      }

      const record = data as { password: string };
      setRecoveredPassword(record.password);
    } catch {
      setRecoverError("通信エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setRecovering(false);
    }
  }

  return (
    <div className="card auth-card">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="form-error-banner" role="alert">
            {error}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="login-username">ユーザー名</label>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        <div className="button-group">
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? "ログイン中..." : "ログイン"}
          </button>
          <Link href="/register" className="button button-secondary">
            新規登録はこちら
          </Link>
        </div>
      </form>

      <button
        type="button"
        className="auth-card__recover-toggle"
        onClick={() => setShowRecover((value) => !value)}
      >
        パスワードを忘れた方はこちら
      </button>

      {showRecover && (
        <form onSubmit={handleRecover} className="auth-card__recover">
          <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
            登録時のユーザー名を入力すると、アプリが自動発行したパスワードを再確認できます。
          </p>
          {recoverError && (
            <p className="form-error" role="alert">
              {recoverError}
            </p>
          )}
          {recoveredPassword && (
            <p className="auth-card__recovered-password">
              パスワード: <strong>{recoveredPassword}</strong>
            </p>
          )}
          <div className="form-field">
            <label htmlFor="recover-username">ユーザー名</label>
            <input
              id="recover-username"
              type="text"
              value={recoverUsername}
              onChange={(event) => setRecoverUsername(event.target.value)}
            />
          </div>
          <button type="submit" className="button button-secondary" disabled={recovering}>
            {recovering ? "確認中..." : "パスワードを確認する"}
          </button>
        </form>
      )}
    </div>
  );
}
