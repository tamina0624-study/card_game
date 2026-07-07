<?php

/**
 * ユーザー認証まわりの組み立て・生成ヘルパー(`users.php` から共有)。
 *
 * パスワードはアプリが生成したランダムな10文字英数字であり、ユーザー自身が
 * 選んだ秘密情報ではないため平文でDBに保持する(`schema.sql` の `users` テーブル
 * コメント参照)。本人からの問い合わせ(`action=recover`)にそのまま答えられるようにする。
 */

const SESSION_TTL_DAYS = 30;
const PASSWORD_LENGTH = 10;
const PASSWORD_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** アプリがランダムに生成する10文字の英数字パスワード(`random_int` によるCSPRNG)。 */
function generate_random_password(): string
{
    $charsetLength = strlen(PASSWORD_CHARSET);
    $password = '';
    for ($i = 0; $i < PASSWORD_LENGTH; $i++) {
        $password .= PASSWORD_CHARSET[random_int(0, $charsetLength - 1)];
    }
    return $password;
}

/** `users` 1行を(パスワードを含めない)公開用のユーザー情報に変換する。 */
function assemble_user(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'username' => $row['username'],
        'createdAt' => $row['created_at'],
    ];
}

/**
 * ログインセッションを新規作成し、トークンを返す。
 * トークンはランダムな64文字の16進文字列(推測不可能)、有効期限は作成時点から
 * {@see SESSION_TTL_DAYS} 日後。
 */
function create_session(PDO $pdo, int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $pdo->prepare(
        'INSERT INTO user_sessions (user_id, token, expires_at)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ' . SESSION_TTL_DAYS . ' DAY))'
    )->execute([$userId, $token]);
    return $token;
}

/** トークンから有効なセッションのユーザーを取得する。見つからない・期限切れの場合は `null`。 */
function find_user_by_token(PDO $pdo, string $token): ?array
{
    $stmt = $pdo->prepare(
        'SELECT u.* FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ?: null;
}
