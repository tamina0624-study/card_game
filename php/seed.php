<?php

/**
 * 開発・確認用サンプルデータ投入の保護エンドポイント(`src/lib/db/seed.ts` のPHP版)。
 *
 * `seed-data.json`(`node -e`で`seed.ts`のCHARACTERS/DECKS配列リテラルをそのまま
 * 抽出したもの、手動転記によるミスを避けるため)を読み込み、対象テーブルを
 * 依存順(子→親)にDELETEしてから再投入する(何度実行しても同じ結果になる)。
 * `imageUrl` はSQLite版の相対パス(`/characters/sample/xxx.png`)ではなく、
 * `ASSET_BASE_URL` を前置した絶対URLとして保存する。
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';

require_admin_key();

$seedData = json_decode(file_get_contents(__DIR__ . '/seed-data.json'), true);
$characters = $seedData['characters'];
$decks = $seedData['decks'];

$seededTables = [
    'characters', 'character_parameters', 'special_moves',
    'decks', 'deck_cards', 'battles', 'battle_logs', 'battle_events',
];

$pdo = get_pdo();

// battles系はdecksへの外部キー参照を持つため、依存関係の末端(子)から順に削除する。
// `ALTER TABLE`(DDL)はMySQLでは実行時に暗黙のコミットが発生し、後続の
// beginTransaction()と両立できないため、DELETE/ALTER TABLEはトランザクションの外で行い、
// 実際にロールバックが必要になりうるINSERT群だけを単一トランザクションにまとめる。
$pdo->exec('DELETE FROM battle_events');
$pdo->exec('DELETE FROM battle_logs');
$pdo->exec('DELETE FROM battles');
$pdo->exec('DELETE FROM deck_cards');
$pdo->exec('DELETE FROM decks');
$pdo->exec('DELETE FROM special_moves');
$pdo->exec('DELETE FROM character_parameters');
$pdo->exec('DELETE FROM characters');

// AUTO_INCREMENTのカウンタもリセットし、再実行時に毎回同じIDで投入されるようにする。
foreach ($seededTables as $table) {
    $pdo->exec("ALTER TABLE `{$table}` AUTO_INCREMENT = 1");
}

$pdo->beginTransaction();

try {
    $insertCharacter = $pdo->prepare(
        'INSERT INTO characters (name, description, image_url, total_points) VALUES (?, ?, ?, ?)'
    );
    $insertParameter = $pdo->prepare(
        'INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES (?, ?, ?, ?)'
    );
    $insertMove = $pdo->prepare(
        'INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES (?, ?, ?, ?, ?)'
    );

    $assetBase = rtrim(ASSET_BASE_URL, '/');
    $nameToId = [];

    foreach ($characters as $character) {
        $totalPoints = array_reduce(
            $character['parameters'],
            fn($sum, $p) => $sum + $p['value'],
            0
        );
        if ($totalPoints > 100) {
            throw new RuntimeException(
                "シードデータ不正: 「{$character['name']}」のパラメータ合計が100を超えています ({$totalPoints})"
            );
        }

        $imageUrl = isset($character['imageUrl']) ? $assetBase . $character['imageUrl'] : null;

        $insertCharacter->execute([
            $character['name'],
            $character['description'],
            $imageUrl,
            $totalPoints,
        ]);
        $characterId = (int) $pdo->lastInsertId();
        $nameToId[$character['name']] = $characterId;

        foreach (array_values($character['parameters']) as $index => $param) {
            $insertParameter->execute([$characterId, $param['name'], $param['value'], $index]);
        }
        foreach (array_values($character['specialMoves']) as $index => $move) {
            $insertMove->execute([
                $characterId,
                $move['name'],
                $move['description'],
                $move['flavorText'] ?? null,
                $index,
            ]);
        }
    }

    $insertDeck = $pdo->prepare('INSERT INTO decks (name, owner_name) VALUES (?, ?)');
    $insertDeckCard = $pdo->prepare(
        'INSERT INTO deck_cards (deck_id, character_id, role, slot_order) VALUES (?, ?, ?, ?)'
    );

    foreach ($decks as $deck) {
        if (count($deck['front']) !== 4 || count($deck['bench']) !== 4) {
            throw new RuntimeException(
                "シードデータ不正: 「{$deck['name']}」は前衛4体・控え4体である必要があります"
            );
        }

        $insertDeck->execute([$deck['name'], $deck['ownerName']]);
        $deckId = (int) $pdo->lastInsertId();

        $assign = function (array $characterNames, string $role) use ($insertDeckCard, $nameToId, $deckId, $deck) {
            foreach (array_values($characterNames) as $index => $characterName) {
                if (!isset($nameToId[$characterName])) {
                    throw new RuntimeException(
                        "シードデータ不正: 「{$deck['name']}」が参照するキャラクター「{$characterName}」が見つかりません"
                    );
                }
                $insertDeckCard->execute([$deckId, $nameToId[$characterName], $role, $index]);
            }
        };

        $assign($deck['front'], 'front');
        $assign($deck['bench'], 'bench');
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $e;
}

// ストーリー章の投入(追加機能20260707.md「ストーリー機能」)。
// `users`/`user_sessions`/`story_plays`(ユーザーのプレイ履歴)は実データのため、
// 上記のキャラクター/デッキ系とは異なりDELETEで全消去はしない。`story_chapters` も
// 削除はせず、`chapter_number` の重複時は `INSERT IGNORE` でスキップする(既存の章は
// 上書きしない)、何度実行しても安全な追記のみの処理とする。
$storyChapters = [
    [
        'chapterNumber' => 1,
        'title' => '旅立ちの町、始まりの召集',
        'outline' => 'アルゼリオンの声に導かれ、主人公は辺境の町サレイユに召集される。' .
            '町では魔物の気配が増しており、冒険者ギルドは新たな戦力を求めていた。' .
            '主人公はギルドで自らのカードを示し、初めての依頼(町の周辺に現れた小型魔物の討伐)を受けることになる。',
    ],
    [
        'chapterNumber' => 2,
        'title' => '霧の森の異変',
        'outline' => 'サレイユの北に広がる「霧の森」で旅人が消える事件が相次いでいる。' .
            '主人公は調査のため森へ向かい、霧の奥で古い祭壇と、そこに巣食う強力な魔物と遭遇する。' .
            '仲間との連携か単独での判断か、主人公の選択が霧の森の運命を左右する。',
    ],
    [
        'chapterNumber' => 3,
        'title' => '国境の砦、裏切りの影',
        'outline' => '隣国との国境を守る砦から救援要請が届く。砦の内部には裏切り者がいるという噂があり、' .
            '主人公は砦の兵士たちと協力しながら真相を探ることになる。' .
            '最終的に姿を現す黒幕との対峙で、主人公はこれまでの戦いで培った力を試される。',
    ],
];

$insertChapter = $pdo->prepare(
    'INSERT IGNORE INTO story_chapters (chapter_number, title, outline) VALUES (?, ?, ?)'
);
foreach ($storyChapters as $chapter) {
    $insertChapter->execute([$chapter['chapterNumber'], $chapter['title'], $chapter['outline']]);
}

json_response([
    'message' => sprintf(
        'サンプルキャラクター%d体・サンプルデッキ%d件・ストーリー章%d件(既存分はスキップ)を投入しました。',
        count($characters),
        count($decks),
        count($storyChapters)
    ),
]);
