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

// `characters.user_id`(キャラクター作成・編集画面の「システムキャラクターと自分が
// 作ったキャラクターのみ表示」対応)の追加。上記と同じ理由で個別ALTERにしている。
// 列追加と同時に、この時点で既に登録されている全キャラクターをシステムキャラクター
// (`is_system = 1`)へ一括移行する(ユーザー要望「登録されているキャラクターは全部
// システムキャラクターの領域にしてください」対応)。`UPDATE` は「列がまだ無い=
// このブロックを初めて実行する」ときのみ走る一度きりの処理のため、今後ユーザーが
// 新規作成するキャラクター(user_idを持つ・is_system=0)には影響しない。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'characters' AND column_name = 'user_id'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec(
        'ALTER TABLE characters
         ADD COLUMN user_id INT NULL AFTER is_system,
         ADD KEY idx_characters_user_id (user_id),
         ADD CONSTRAINT fk_characters_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'
    );
    $pdo->exec('UPDATE characters SET is_system = 1');
}

// `story_chapters.mascot_character_id`/`mob_deck_id`/`boss_deck_id`
// (追加機能20260708.md「ストーリーモードに戦闘を組み込みたい」対応)の追加。
// 上記と同じ理由(既存環境の story_chapters は作成済み)で個別ALTERにしている。
// いずれもNULL許容で、管理者が `stories.php` action=create-chapter で章ごとに
// 任意設定する(未設定の章は雑魚戦・ボス戦・マスコット無しの従来通りの章のまま)。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'story_chapters' AND column_name = 'mascot_character_id'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec(
        'ALTER TABLE story_chapters
         ADD COLUMN mascot_character_id INT NULL AFTER outline,
         ADD COLUMN mob_deck_id INT NULL AFTER mascot_character_id,
         ADD COLUMN boss_deck_id INT NULL AFTER mob_deck_id,
         ADD KEY idx_story_chapters_mascot_character_id (mascot_character_id),
         ADD KEY idx_story_chapters_mob_deck_id (mob_deck_id),
         ADD KEY idx_story_chapters_boss_deck_id (boss_deck_id),
         ADD CONSTRAINT fk_story_chapters_mascot_character
           FOREIGN KEY (mascot_character_id) REFERENCES characters(id) ON DELETE SET NULL,
         ADD CONSTRAINT fk_story_chapters_mob_deck
           FOREIGN KEY (mob_deck_id) REFERENCES decks(id) ON DELETE SET NULL,
         ADD CONSTRAINT fk_story_chapters_boss_deck
           FOREIGN KEY (boss_deck_id) REFERENCES decks(id) ON DELETE SET NULL'
    );
}

// `story_plays.cleared_at`(章の「クリア」判定。次章のロック解除条件として使う、
// `stories.php` 参照)の追加。ボス戦が設定されていない章(`boss_deck_id IS NULL`)は
// 従来通り「プレイ済み=クリア済み」とするため、列追加と同時に既存行を
// `cleared_at = created_at` で一括バックフィルする(この時点で存在する章は
// いずれも `boss_deck_id` を持たない旧仕様の章のため無条件で問題ない)。
// `UPDATE` は「列がまだ無い=このブロックを初めて実行する」ときのみ走る一度きりの
// 処理のため、以後ボス戦付きの章でユーザーがボス戦に負けている間の
// `cleared_at IS NULL` 状態を誤って上書きすることはない。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'story_plays' AND column_name = 'cleared_at'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec('ALTER TABLE story_plays ADD COLUMN cleared_at DATETIME NULL AFTER content');
    $pdo->exec('UPDATE story_plays SET cleared_at = created_at WHERE cleared_at IS NULL');
}

// `battles.story_chapter_id`/`story_phase`(章内の雑魚戦・ボス戦を`battles`テーブル
// 上でも一般のPvP対戦と同じ仕組み(AI審判・ログ・履歴画面)で扱うための紐付け)の追加。
// 通常のPvP対戦(`/battles`ページ経由)はいずれもNULLのまま。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'battles' AND column_name = 'story_chapter_id'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec(
        "ALTER TABLE battles
         ADD COLUMN story_chapter_id INT NULL AFTER deck_b_id,
         ADD COLUMN story_phase ENUM('mob', 'boss') NULL AFTER story_chapter_id,
         ADD KEY idx_battles_story_chapter_id (story_chapter_id),
         ADD CONSTRAINT fk_battles_story_chapter
           FOREIGN KEY (story_chapter_id) REFERENCES story_chapters(id) ON DELETE SET NULL"
    );
}

// `decks.is_story_enemy`(章の雑魚デッキ・ボスデッキとして登録されたデッキの印)の追加。
// `decks.php` の無条件一覧(通常のPvP対戦セットアップ画面の対戦相手プルダウン)は
// この列で `= 0` に絞り込み、ボス・雑魚デッキが通常対戦の相手として選べて
// しまわない(ネタバレ・違和感の防止)ようにする。
$columnCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'decks' AND column_name = 'is_story_enemy'"
);
$columnCheck->execute();
if ((int) $columnCheck->fetchColumn() === 0) {
    $pdo->exec(
        'ALTER TABLE decks ADD COLUMN is_story_enemy TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id'
    );
}

json_response(['message' => 'migrate completed', 'statements' => count($statements)]);
