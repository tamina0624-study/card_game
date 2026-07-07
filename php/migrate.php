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

// `decks.user_id`(追加機能20260707「ユーザー専用のデッキ」対応)の追加。
// `decks` は `schema.sql` 内で `users` より前に定義されており、`CREATE TABLE` に
// インラインで外部キーを書くと新規環境で「参照先usersが未作成」エラーになる。
// また既存環境(本番)の `decks` テーブルは既に作成済みのため
// `CREATE TABLE IF NOT EXISTS` では列を追加できない。そのためこの列だけは
// `information_schema` で存在確認したうえでのALTER(新規・既存環境どちらでも
// 安全に何度でも実行できる)という個別対応にしている。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'decks' AND column_name = 'user_id'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec(
        'ALTER TABLE decks
         ADD COLUMN user_id INT NULL AFTER owner_name,
         ADD KEY idx_decks_user_id (user_id),
         ADD CONSTRAINT fk_decks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'
    );
}

// `characters.is_system`(システム登録キャラクターの編集ロック対応)の追加。
// 上記の decks.user_id と同じ理由(既存環境の characters は作成済みのため
// `CREATE TABLE IF NOT EXISTS` では列を追加できない)で個別ALTERにしている。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'characters' AND column_name = 'is_system'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec(
        'ALTER TABLE characters ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0 AFTER total_points'
    );
}

json_response(['message' => 'migrate completed', 'statements' => count($statements)]);
