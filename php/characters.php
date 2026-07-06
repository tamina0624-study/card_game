<?php

/**
 * キャラクターCRUDエンドポイント(`src/lib/characters/repository.ts` のPHP版)。
 *
 * GET(id無し)    = 一覧(`listCharacters`、全件の全情報を返す。サマリ変換はNext.js側で行う)
 * GET(id=)       = 詳細(`getCharacterById`)
 * POST           = 作成(`createCharacter`)
 * PUT(id=)       = 更新(`updateCharacter`)
 * DELETE(id=)    = 削除(`deleteCharacter`、使用中の場合は409 `CHARACTER_IN_USE`)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/characters.php';

require_api_key();

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$pdo = get_pdo();

if ($method === 'GET' && $id === null) {
    $rows = $pdo->query('SELECT * FROM characters ORDER BY id ASC')->fetchAll();
    json_response(array_map(fn($row) => assemble_character($pdo, $row), $rows));
}

if ($method === 'GET' && $id !== null) {
    $stmt = $pdo->prepare('SELECT * FROM characters WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('キャラクターが見つかりません。', 404);
    }
    json_response(assemble_character($pdo, $row));
}

if ($method === 'POST') {
    $input = read_json_body();
    $totalPoints = compute_total_points($input['parameters'] ?? []);

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO characters (name, description, image_url, total_points) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $input['name'],
            $input['description'] ?? null,
            $input['imageUrl'] ?? null,
            $totalPoints,
        ]);
        $characterId = (int) $pdo->lastInsertId();
        replace_parameters_and_moves($pdo, $characterId, $input);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT * FROM characters WHERE id = ?');
    $stmt->execute([$characterId]);
    json_response(assemble_character($pdo, $stmt->fetch()), 201);
}

if ($method === 'PUT' && $id !== null) {
    $input = read_json_body();
    $totalPoints = compute_total_points($input['parameters'] ?? []);

    $stmt = $pdo->prepare('SELECT id FROM characters WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        json_error('キャラクターが見つかりません。', 404);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'UPDATE characters SET name = ?, description = ?, image_url = ?, total_points = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?'
        )->execute([
            $input['name'],
            $input['description'] ?? null,
            $input['imageUrl'] ?? null,
            $totalPoints,
            $id,
        ]);
        replace_parameters_and_moves($pdo, $id, $input);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT * FROM characters WHERE id = ?');
    $stmt->execute([$id]);
    json_response(assemble_character($pdo, $stmt->fetch()));
}

if ($method === 'DELETE' && $id !== null) {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT id FROM characters WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            $pdo->rollBack();
            json_error('キャラクターが見つかりません。', 404);
        }

        $stmt = $pdo->prepare('SELECT 1 FROM deck_cards WHERE character_id = ? LIMIT 1');
        $stmt->execute([$id]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            json_error(
                "キャラクター(id={$id})はデッキで使用されているため削除できません。",
                409,
                'CHARACTER_IN_USE'
            );
        }

        $pdo->prepare('DELETE FROM characters WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    json_response(null, 204);
}

json_error('サポートされていないリクエストです。', 405);
