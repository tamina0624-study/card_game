<?php

/**
 * デッキCRUDエンドポイント(`src/lib/decks/repository.ts` のPHP版)。
 *
 * GET(id無し, userId無し, ownerId無し) = 一覧(`listDecks`、概要DTOのみ、全ユーザー分)
 * GET(id無し, userId=)    = そのユーザーの専用デッキ(`getUserDeck`、最も新しく作成した
 *                           1件をfront/bench全情報付きで返す。無ければ404)
 * GET(id無し, ownerId=)   = 指定ユーザーが作成したデッキの一覧(`listDecks(ownerId)`、
 *                           概要DTOのみ。デッキ作成・編集画面の一覧はこちらを使い、
 *                           他ユーザーのデッキが混ざらないようにする)
 * GET(id=)               = 詳細(`getDeckById`、front/bench各4体のキャラクター全情報を含む)
 * POST                   = 作成(`createDeck`、characterId不在時は400 `CHARACTER_NOT_FOUND`。
 *                           `userId`(ログイン中ユーザーのid)が指定されていれば
 *                           `decks.user_id` に保存し、そのユーザーの専用デッキとする)
 * PUT(id=)               = 更新(`updateDeck`。`user_id`は作成時のまま変更しない)
 * DELETE(id=)            = 削除(`deleteDeck`、使用中の場合は409 `DECK_IN_USE`)
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

/** `cards` に含まれるすべての `characterId` が実在することを確認する。無ければ400。 */
function assert_characters_exist(PDO $pdo, array $characterIds): void
{
    $stmt = $pdo->prepare('SELECT 1 FROM characters WHERE id = ?');
    foreach ($characterIds as $characterId) {
        $stmt->execute([$characterId]);
        if (!$stmt->fetch()) {
            json_response([
                'error' => "キャラクター(id={$characterId})が見つかりません。",
                'code' => 'CHARACTER_NOT_FOUND',
                'characterId' => (int) $characterId,
            ], 400);
        }
    }
}

/** `deck_cards` へ入力内容を挿入する。`slot_order` はfront/bench各グループ内の出現順(0始まり)。 */
function insert_deck_cards(PDO $pdo, int $deckId, array $cards): void
{
    $insert = $pdo->prepare(
        'INSERT INTO deck_cards (deck_id, character_id, role, slot_order) VALUES (?, ?, ?, ?)'
    );
    $front = array_values(array_filter($cards, fn($c) => $c['role'] === 'front'));
    foreach ($front as $index => $card) {
        $insert->execute([$deckId, $card['characterId'], $card['role'], $index]);
    }
    $bench = array_values(array_filter($cards, fn($c) => $c['role'] === 'bench'));
    foreach ($bench as $index => $card) {
        $insert->execute([$deckId, $card['characterId'], $card['role'], $index]);
    }
}

/** `decks` 1行 + front/bench各4体のキャラクター全情報を組み立てる。存在しなければnull。 */
function find_deck_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM decks WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $cardStmt = $pdo->prepare(
        'SELECT * FROM deck_cards WHERE deck_id = ? ORDER BY role ASC, slot_order ASC, id ASC'
    );
    $cardStmt->execute([$id]);
    $cardRows = $cardStmt->fetchAll();

    $front = [];
    $bench = [];
    $charStmt = $pdo->prepare('SELECT * FROM characters WHERE id = ?');
    foreach ($cardRows as $cardRow) {
        $charStmt->execute([$cardRow['character_id']]);
        $characterRow = $charStmt->fetch();
        if (!$characterRow) {
            throw new RuntimeException(
                "デッキ(id={$id})が参照するキャラクター(id={$cardRow['character_id']})が見つかりません。"
            );
        }
        $character = assemble_character($pdo, $characterRow);
        if ($cardRow['role'] === 'front') {
            $front[] = $character;
        } else {
            $bench[] = $character;
        }
    }

    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'ownerName' => $row['owner_name'],
        'userId' => $row['user_id'] !== null ? (int) $row['user_id'] : null,
        'front' => $front,
        'bench' => $bench,
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

$userId = isset($_GET['userId']) ? (int) $_GET['userId'] : null;
$ownerId = isset($_GET['ownerId']) ? (int) $_GET['ownerId'] : null;

if ($method === 'GET' && $id === null && $userId !== null) {
    $stmt = $pdo->prepare('SELECT id FROM decks WHERE user_id = ? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('専用デッキがまだ作成されていません。', 404);
    }
    json_response(find_deck_by_id($pdo, (int) $row['id']));
}

if ($method === 'GET' && $id === null && $ownerId !== null) {
    $stmt = $pdo->prepare(
        'SELECT id, name, owner_name, created_at FROM decks WHERE user_id = ? ORDER BY id ASC'
    );
    $stmt->execute([$ownerId]);
    $rows = $stmt->fetchAll();
    json_response(array_map(fn($row) => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'ownerName' => $row['owner_name'],
        'createdAt' => $row['created_at'],
    ], $rows));
}

if ($method === 'GET' && $id === null) {
    $rows = $pdo->query('SELECT id, name, owner_name, created_at FROM decks ORDER BY id ASC')->fetchAll();
    json_response(array_map(fn($row) => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'ownerName' => $row['owner_name'],
        'createdAt' => $row['created_at'],
    ], $rows));
}

if ($method === 'GET' && $id !== null) {
    $deck = find_deck_by_id($pdo, $id);
    if (!$deck) {
        json_error('デッキが見つかりません。', 404);
    }
    json_response($deck);
}

if ($method === 'POST') {
    $input = read_json_body();
    $characterIds = array_map(fn($c) => (int) $c['characterId'], $input['cards']);
    assert_characters_exist($pdo, $characterIds);

    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO decks (name, owner_name, user_id) VALUES (?, ?, ?)')
            ->execute([
                $input['name'],
                $input['ownerName'] ?? null,
                isset($input['userId']) && $input['userId'] !== null ? (int) $input['userId'] : null,
            ]);
        $deckId = (int) $pdo->lastInsertId();
        insert_deck_cards($pdo, $deckId, $input['cards']);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(find_deck_by_id($pdo, $deckId), 201);
}

if ($method === 'PUT' && $id !== null) {
    $input = read_json_body();

    $stmt = $pdo->prepare('SELECT id FROM decks WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        json_error('デッキが見つかりません。', 404);
    }

    $characterIds = array_map(fn($c) => (int) $c['characterId'], $input['cards']);
    assert_characters_exist($pdo, $characterIds);

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE decks SET name = ?, owner_name = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?')
            ->execute([$input['name'], $input['ownerName'] ?? null, $id]);
        $pdo->prepare('DELETE FROM deck_cards WHERE deck_id = ?')->execute([$id]);
        insert_deck_cards($pdo, $id, $input['cards']);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(find_deck_by_id($pdo, $id));
}

if ($method === 'DELETE' && $id !== null) {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT id FROM decks WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            $pdo->rollBack();
            json_error('デッキが見つかりません。', 404);
        }

        $stmt = $pdo->prepare('SELECT 1 FROM battles WHERE deck_a_id = ? OR deck_b_id = ? LIMIT 1');
        $stmt->execute([$id, $id]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            json_error(
                "デッキ(id={$id})は対戦で使用されているため削除できません。",
                409,
                'DECK_IN_USE'
            );
        }

        $pdo->prepare('DELETE FROM decks WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    json_response(null, 204);
}

json_error('サポートされていないリクエストです。', 405);
