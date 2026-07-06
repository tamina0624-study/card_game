<?php

require_once __DIR__ . '/response.php';

/** 通常CRUDエンドポイント用の認証。`X-API-Key` ヘッダーが `API_KEY` と一致しない場合は401。 */
function require_api_key(): void
{
    $header = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($header === '' || !hash_equals(API_KEY, $header)) {
        json_error('認証に失敗しました。', 401);
    }
}

/**
 * migrate.php / seed.php 専用の認証。通常のAPI_KEYとは別のADMIN_KEYを要求する
 * (全データ削除を伴う破壊的操作のため、鍵漏洩時の被害範囲を分離する)。
 */
function require_admin_key(): void
{
    $header = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($header === '' || !hash_equals(ADMIN_KEY, $header)) {
        json_error('認証に失敗しました。', 401);
    }
}
