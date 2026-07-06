<?php

/** JSONレスポンスを返して終了する。`$data === null` の場合は本文なし(204等)。 */
function json_response($data, int $status = 200): void
{
    http_response_code($status);
    if ($data === null) {
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * エラーレスポンスを返して終了する。`$code` は呼び出し元(Next.js側のbridge client)が
 * `CharacterInUseError`等の独自例外を再構築するための識別子
 * (`CHARACTER_IN_USE` / `CHARACTER_NOT_FOUND` / `DECK_IN_USE`)。
 */
function json_error(string $message, int $status, ?string $code = null): void
{
    $body = ['error' => $message];
    if ($code !== null) {
        $body['code'] = $code;
    }
    json_response($body, $status);
}

/** リクエストボディをJSONとしてパースする。失敗時は400を返して終了する。 */
function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('リクエストボディがJSONとして不正です。', 400);
    }
    return $data;
}
