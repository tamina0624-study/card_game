<?php

/**
 * ユーザー認証エンドポイント(`src/lib/auth/repository.ts` のPHP版)。
 *
 * 通常のCRUDエンドポイントと同じ `X-API-Key`(`require_api_key`)で保護する。
 * 「誰としてログインしているか」の判定(セッショントークンの検証)はここでは行わず、
 * Next.js側(信頼済みのアプリケーションサーバー)がCookieからトークンを取り出し
 * `action=me` を呼び出して解決する設計とする(他の action は解決済みの `userId` を
 * 受け取るのみで、トークンの検証を重複させない)。
 *
 * POST action=register  = ユーザー登録。ランダムな10文字パスワードを生成し作成、
 *                          即座にセッションも発行する。
 * POST action=login     = ログイン。username/passwordが一致すればセッションを発行する。
 * POST action=logout    = ログアウト。指定トークンのセッションを削除する。
 * POST action=me        = トークンから現在のユーザーを解決する。
 * POST action=recover   = パスワード問い合わせ。usernameが存在すれば平文パスワードを返す
 *                          (`schema.sql` の `users` テーブルコメントの通り、この目的のために
 *                          平文保存している)。
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/users.php';

require_api_key();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('サポートされていないリクエストです。', 405);
}

const MIN_USERNAME_LENGTH = 1;
const MAX_USERNAME_LENGTH = 50;

$input = read_json_body();
$action = $input['action'] ?? null;
$pdo = get_pdo();

if ($action === 'register') {
    $username = trim((string) ($input['username'] ?? ''));
    $length = mb_strlen($username);
    if ($length < MIN_USERNAME_LENGTH || $length > MAX_USERNAME_LENGTH) {
        json_error('ユーザー名は1〜50文字で入力してください。', 400);
    }

    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        json_error('そのユーザー名は既に使われています。', 409, 'USERNAME_TAKEN');
    }

    $password = generate_random_password();

    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO users (username, password) VALUES (?, ?)')->execute([$username, $password]);
        $userId = (int) $pdo->lastInsertId();
        $token = create_session($pdo, $userId);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    json_response([
        'user' => assemble_user($stmt->fetch()),
        'password' => $password,
        'token' => $token,
    ], 201);
}

if ($action === 'login') {
    $username = trim((string) ($input['username'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();

    if (!$row || !hash_equals($row['password'], $password)) {
        json_error('ユーザー名またはパスワードが正しくありません。', 401, 'INVALID_CREDENTIALS');
    }

    $token = create_session($pdo, (int) $row['id']);
    json_response(['user' => assemble_user($row), 'token' => $token]);
}

if ($action === 'logout') {
    $token = (string) ($input['token'] ?? '');
    if ($token !== '') {
        $pdo->prepare('DELETE FROM user_sessions WHERE token = ?')->execute([$token]);
    }
    json_response(['ok' => true]);
}

if ($action === 'me') {
    $token = (string) ($input['token'] ?? '');
    $user = $token !== '' ? find_user_by_token($pdo, $token) : null;
    if (!$user) {
        json_error('セッションが無効です。', 401, 'INVALID_SESSION');
    }
    json_response(['user' => assemble_user($user)]);
}

if ($action === 'recover') {
    $username = trim((string) ($input['username'] ?? ''));
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('そのユーザー名は登録されていません。', 404);
    }
    json_response(['username' => $row['username'], 'password' => $row['password']]);
}

json_error('不正なリクエストです。', 400);
