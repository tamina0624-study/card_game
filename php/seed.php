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

json_response([
    'message' => sprintf(
        'サンプルキャラクター%d体・サンプルデッキ%d件を投入しました。',
        count($characters),
        count($decks)
    ),
]);
