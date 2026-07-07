/**
 * ユーザー認証のリポジトリ層。
 *
 * MySQLへは直接接続せず、PHPブリッジ(`php/users.php`)にHTTP経由でアクセスする
 * (`lib/characters/repository.ts` と同じ方針)。「誰としてログインしているか」の
 * Cookie/セッショントークンの扱いは `lib/auth/session.ts` の責務であり、ここでは
 * トークン・パスワードそのものを引数/戻り値として扱う薄いラッパーに徹する。
 */

import { BridgeError, callBridge } from "@/lib/bridge/client";
import type { User } from "@/lib/types";

/** ユーザー名が既に使われている場合に投げられるエラー(呼び出し元は409として扱う)。 */
export class UsernameTakenError extends Error {
  readonly code = "USERNAME_TAKEN" as const;
  constructor(message: string) {
    super(message);
    this.name = "UsernameTakenError";
  }
}

/** ユーザー名またはパスワードが一致しない場合に投げられるエラー(呼び出し元は401として扱う)。 */
export class InvalidCredentialsError extends Error {
  readonly code = "INVALID_CREDENTIALS" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

/** 該当ユーザー名が登録されていない場合に投げられるエラー(呼び出し元は404として扱う)。 */
export class UsernameNotFoundError extends Error {
  readonly code = "USERNAME_NOT_FOUND" as const;
  constructor(message: string) {
    super(message);
    this.name = "UsernameNotFoundError";
  }
}

/** `POST /api/auth/register` の内部結果。`token` はCookieに保存するのみでクライアントへは返さない。 */
export type RegisterResult = { user: User; password: string; token: string };

/** `POST /api/auth/login` の内部結果。`token` はCookieに保存するのみでクライアントへは返さない。 */
export type LoginResult = { user: User; token: string };

/**
 * ユーザーを新規登録する。パスワードはPHP側(`generate_random_password`)が
 * ランダムな10文字英数字で生成する(ユーザーは選べない)。同時にセッションも発行される。
 * ユーザー名が既に使われている場合は {@link UsernameTakenError} を投げる。
 */
export async function registerUser(username: string): Promise<RegisterResult> {
  try {
    return await callBridge<RegisterResult>("users.php", {
      method: "POST",
      body: { action: "register", username },
    });
  } catch (error) {
    if (error instanceof BridgeError && error.code === "USERNAME_TAKEN") {
      throw new UsernameTakenError(error.message);
    }
    throw error;
  }
}

/**
 * ユーザー名・パスワードでログインする。一致すればセッションを発行する。
 * 一致しない場合は {@link InvalidCredentialsError} を投げる。
 */
export async function loginUser(username: string, password: string): Promise<LoginResult> {
  try {
    return await callBridge<LoginResult>("users.php", {
      method: "POST",
      body: { action: "login", username, password },
    });
  } catch (error) {
    if (error instanceof BridgeError && error.code === "INVALID_CREDENTIALS") {
      throw new InvalidCredentialsError(error.message);
    }
    throw error;
  }
}

/** 指定したセッショントークンを無効化する(トークンが存在しない場合も含め常に成功扱い)。 */
export async function logoutUser(token: string): Promise<void> {
  await callBridge<{ ok: true }>("users.php", {
    method: "POST",
    body: { action: "logout", token },
  });
}

/** セッショントークンから現在のユーザーを取得する。無効・期限切れの場合は `null`。 */
export async function getUserByToken(token: string): Promise<User | null> {
  try {
    const result = await callBridge<{ user: User }>("users.php", {
      method: "POST",
      body: { action: "me", token },
    });
    return result.user;
  } catch (error) {
    if (error instanceof BridgeError && error.code === "INVALID_SESSION") {
      return null;
    }
    throw error;
  }
}

/**
 * パスワードを忘れた場合の問い合わせ(アプリが自動生成した平文パスワードをそのまま返す、
 * `schema.sql` の `users` テーブルコメント参照)。該当ユーザー名が無い場合は
 * {@link UsernameNotFoundError} を投げる。
 */
export async function recoverPassword(username: string): Promise<{ username: string; password: string }> {
  try {
    return await callBridge<{ username: string; password: string }>("users.php", {
      method: "POST",
      body: { action: "recover", username },
    });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404) {
      throw new UsernameNotFoundError(error.message);
    }
    throw error;
  }
}
