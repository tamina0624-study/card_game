<?php

/**
 * キャラクター1体分の組み立てヘルパー。`characters.php` と `decks.php`(front/bench の
 * キャラクター全情報を組み立てる際)の両方から共有する
 * (`src/lib/characters/repository.ts` の `assembleCharacter` に対応)。
 */

function to_parameter(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'value' => (int) $row['value'],
        'sortOrder' => (int) $row['sort_order'],
    ];
}

function to_special_move(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'description' => $row['description'],
        'flavorText' => $row['flavor_text'],
        'sortOrder' => (int) $row['sort_order'],
    ];
}

/** `characters` 1行 + 関連するパラメーター/必殺技を取得し、`Character` 型(連想配列)に組み立てる。 */
function assemble_character(PDO $pdo, array $row): array
{
    $paramStmt = $pdo->prepare(
        'SELECT * FROM character_parameters WHERE character_id = ? ORDER BY sort_order ASC, id ASC'
    );
    $paramStmt->execute([$row['id']]);
    $parameters = array_map('to_parameter', $paramStmt->fetchAll());

    $moveStmt = $pdo->prepare(
        'SELECT * FROM special_moves WHERE character_id = ? ORDER BY sort_order ASC, id ASC'
    );
    $moveStmt->execute([$row['id']]);
    $specialMoves = array_map('to_special_move', $moveStmt->fetchAll());

    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'description' => $row['description'],
        'imageUrl' => $row['image_url'],
        'totalPoints' => (int) $row['total_points'],
        'isSystem' => (bool) $row['is_system'],
        'userId' => isset($row['user_id']) && $row['user_id'] !== null ? (int) $row['user_id'] : null,
        'parameters' => array_values($parameters),
        'specialMoves' => array_values($specialMoves),
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

/** パラメーター合計値(`total_points` に保存する値)を計算する。 */
function compute_total_points(array $parameters): int
{
    return array_reduce($parameters, fn($sum, $p) => $sum + (int) ($p['value'] ?? 0), 0);
}

/**
 * `character_parameters` / `special_moves` を全削除してから入力内容で再挿入する。
 * 作成時・更新時の両方から呼び出す共通処理(`replaceParametersAndMoves`に対応)。
 */
function replace_parameters_and_moves(PDO $pdo, int $characterId, array $input): void
{
    $pdo->prepare('DELETE FROM character_parameters WHERE character_id = ?')->execute([$characterId]);
    $pdo->prepare('DELETE FROM special_moves WHERE character_id = ?')->execute([$characterId]);

    $insertParam = $pdo->prepare(
        'INSERT INTO character_parameters (character_id, name, value, sort_order) VALUES (?, ?, ?, ?)'
    );
    foreach (array_values($input['parameters'] ?? []) as $index => $parameter) {
        $insertParam->execute([$characterId, $parameter['name'], (int) $parameter['value'], $index]);
    }

    $insertMove = $pdo->prepare(
        'INSERT INTO special_moves (character_id, name, description, flavor_text, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    foreach (array_values($input['specialMoves'] ?? []) as $index => $move) {
        $insertMove->execute([
            $characterId,
            $move['name'],
            $move['description'] ?? null,
            $move['flavorText'] ?? null,
            $index,
        ]);
    }
}
