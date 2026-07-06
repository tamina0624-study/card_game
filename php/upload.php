<?php

/**
 * キャラクター画像アップロードエンドポイント(`src/lib/uploads/storage.ts` のPHP版)。
 *
 * `multipart/form-data` の `file` フィールドを受け取り、MIMEタイプ(finfoによる実体判定、
 * クライアント申告のcontent-typeより信頼できる)・サイズ(2MB上限)を検証したうえで
 * `public_html/card_game/public/uploads/characters/` に保存し、絶対URLを返す。
 * ファイル名はランダムな16バイト16進文字列(uuidと同様に衝突しない一意なファイル名)。
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';

require_api_key();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('サポートされていないリクエストです。', 405);
}

if (!isset($_FILES['file'])) {
    json_error('画像ファイル(file)を指定してください。', 400);
}

$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    json_error('画像ファイル(file)を指定してください。', 400);
}

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const EXTENSIONS_BY_MIME = [
    'image/png' => ['.png'],
    'image/jpeg' => ['.jpg', '.jpeg'],
    'image/webp' => ['.webp'],
    'image/gif' => ['.gif'],
];
const DEFAULT_EXTENSION_BY_MIME = [
    'image/png' => '.png',
    'image/jpeg' => '.jpg',
    'image/webp' => '.webp',
    'image/gif' => '.gif',
];

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mimeType, ALLOWED_MIME_TYPES, true)) {
    json_error(
        '対応していないファイル形式です。png/jpeg/webp/gif形式の画像のみアップロードできます。',
        400,
        'INVALID_FILE_TYPE'
    );
}

if ($file['size'] > MAX_SIZE_BYTES) {
    json_error('ファイルサイズが上限(2MB)を超えています。', 400, 'FILE_TOO_LARGE');
}

$originalExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$originalExtension = $originalExtension !== '' ? '.' . $originalExtension : '';
$allowedExtensions = EXTENSIONS_BY_MIME[$mimeType];
$extension = in_array($originalExtension, $allowedExtensions, true)
    ? $originalExtension
    : DEFAULT_EXTENSION_BY_MIME[$mimeType];

$fileName = bin2hex(random_bytes(16)) . $extension;
$uploadDir = __DIR__ . '/../public/uploads/characters';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

if (!move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $fileName)) {
    json_error('画像の保存に失敗しました。', 500);
}

json_response(['url' => rtrim(ASSET_BASE_URL, '/') . '/uploads/characters/' . $fileName]);
