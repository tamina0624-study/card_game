<?php

/**
 * `schema.sql` を実行してテーブルを作成する保護エンドポイント。
 * `CREATE TABLE IF NOT EXISTS` のみで構成されているため、何度実行しても安全(冪等)。
 * 通常のCRUD用API_KEYとは別の管理者専用シークレット(ADMIN_KEY)を要求する。
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';

require_admin_key();

$sql = file_get_contents(__DIR__ . '/schema.sql');
// 行コメント(`-- ...`)を先に除去してからセミコロンで分割する
// (コメント中に偶然セミコロンが含まれていても分割位置がずれないようにするため)。
$sqlWithoutComments = preg_replace('/^--.*$/m', '', $sql);
$statements = array_values(array_filter(array_map('trim', explode(';', $sqlWithoutComments))));

$pdo = get_pdo();
foreach ($statements as $statement) {
    if ($statement === '') {
        continue;
    }
    $pdo->exec($statement);
}

json_response(['message' => 'migrate completed', 'statements' => count($statements)]);
