<?php

/**
 * バトルエンドポイント(`src/lib/battles/repository.ts` のPHP版)。
 *
 * GET(id無し)             = 一覧(`listBattles`)
 * GET(id=)                = 詳細(`getBattleDetail`)
 * POST action=create-pending = 新規バトルを status='pending' で作成(`createPendingBattle`)
 * POST action=save-result(id=) = AI応答検証済みの結果を保存(`saveBattleResult`)
 * POST action=mark-failed(id=) = 失敗として記録(`markBattleFailed`)
 *
 * `resolveMvpCharacterId`(MVP名→キャラクターID解決、front/bench全16体との突合)は
 * decks/charactersをまたぐ処理のため、PHP側で再実装せずNext.js側(TypeScript)に残す。
 * `save-result` は解決済みの `mvpCharacterId` をプレーンな値として受け取るのみとする。
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';

require_api_key();

const SELECT_BATTLE_WITH_DECK_NAMES = "
  SELECT b.*, da.name AS deck_a_name, dbk.name AS deck_b_name
  FROM battles b
  JOIN decks da ON da.id = b.deck_a_id
  JOIN decks dbk ON dbk.id = b.deck_b_id
";

/** イベントオブジェクトから数値の `turn` 相当フィールドを取り出す。無ければnull。 */
function extract_event_turn(array $event): ?int
{
    $turn = $event['turn'] ?? null;
    if (is_int($turn)) {
        return $turn;
    }
    if (is_float($turn)) {
        return (int) $turn;
    }
    return null;
}

function to_battle_log_entry(array $row): array
{
    return ['turn' => (int) $row['turn'], 'message' => $row['message']];
}

function to_battle_event_detail(array $row): array
{
    return [
        'turn' => $row['turn'] !== null ? (int) $row['turn'] : null,
        'type' => $row['event_type'],
        'character' => $row['character_name'],
        'effect' => $row['effect'],
        'raw' => json_decode($row['raw_json'], true),
    ];
}

function to_battle_detail_base(array $row): array
{
    $analysis = ($row['analysis_team_a'] !== null && $row['analysis_team_b'] !== null && $row['predicted_winner'] !== null)
        ? [
            'teamA' => $row['analysis_team_a'],
            'teamB' => $row['analysis_team_b'],
            'predictedWinner' => $row['predicted_winner'],
        ]
        : null;

    $result = ($row['winner'] !== null && $row['mvp_name'] !== null)
        ? [
            'winner' => $row['winner'],
            'mvpName' => $row['mvp_name'],
            'mvpCharacterId' => $row['mvp_character_id'] !== null ? (int) $row['mvp_character_id'] : null,
        ]
        : null;

    return [
        'id' => (int) $row['id'],
        'status' => $row['status'],
        'deckA' => ['id' => (int) $row['deck_a_id'], 'name' => $row['deck_a_name']],
        'deckB' => ['id' => (int) $row['deck_b_id'], 'name' => $row['deck_b_name']],
        'analysis' => $analysis,
        'result' => $result,
        'errorMessage' => $row['error_message'],
        'createdAt' => $row['created_at'],
        'completedAt' => $row['completed_at'],
    ];
}

function get_battle_detail(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(SELECT_BATTLE_WITH_DECK_NAMES . ' WHERE b.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $logStmt = $pdo->prepare('SELECT * FROM battle_logs WHERE battle_id = ? ORDER BY sort_order ASC, id ASC');
    $logStmt->execute([$id]);
    $logs = array_map('to_battle_log_entry', $logStmt->fetchAll());

    $eventStmt = $pdo->prepare('SELECT * FROM battle_events WHERE battle_id = ? ORDER BY sort_order ASC, id ASC');
    $eventStmt->execute([$id]);
    $events = array_map('to_battle_event_detail', $eventStmt->fetchAll());

    $detail = to_battle_detail_base($row);
    $detail['battleLog'] = array_values($logs);
    $detail['events'] = array_values($events);
    return $detail;
}

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$pdo = get_pdo();

if ($method === 'GET' && $id === null) {
    $rows = $pdo->query(SELECT_BATTLE_WITH_DECK_NAMES . ' ORDER BY b.id ASC')->fetchAll();
    json_response(array_map(function ($row) {
        return [
            'id' => (int) $row['id'],
            'status' => $row['status'],
            'deckA' => ['id' => (int) $row['deck_a_id'], 'name' => $row['deck_a_name']],
            'deckB' => ['id' => (int) $row['deck_b_id'], 'name' => $row['deck_b_name']],
            'winner' => $row['winner'],
            'mvpName' => $row['mvp_name'],
            'createdAt' => $row['created_at'],
            'completedAt' => $row['completed_at'],
        ];
    }, $rows));
}

if ($method === 'GET' && $id !== null) {
    $detail = get_battle_detail($pdo, $id);
    if (!$detail) {
        json_error('対戦が見つかりません。', 404);
    }
    json_response($detail);
}

if ($method === 'POST') {
    $input = read_json_body();
    $action = $input['action'] ?? null;

    if ($action === 'create-pending') {
        $pdo->prepare("INSERT INTO battles (deck_a_id, deck_b_id, status) VALUES (?, ?, 'pending')")
            ->execute([(int) $input['deckAId'], (int) $input['deckBId']]);
        json_response(['id' => (int) $pdo->lastInsertId()], 201);
    }

    if ($action === 'save-result' && $id !== null) {
        $stmt = $pdo->prepare('SELECT id FROM battles WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            json_error("バトル(id={$id})が見つかりません。", 404);
        }

        $parsed = $input['parsed'];
        $rawText = $input['rawText'];
        $mvpCharacterId = isset($input['mvpCharacterId']) && $input['mvpCharacterId'] !== null
            ? (int) $input['mvpCharacterId']
            : null;

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                "UPDATE battles
                 SET status = 'completed',
                     analysis_team_a = ?,
                     analysis_team_b = ?,
                     predicted_winner = ?,
                     winner = ?,
                     mvp_name = ?,
                     mvp_character_id = ?,
                     raw_ai_response = ?,
                     completed_at = UTC_TIMESTAMP()
                 WHERE id = ?"
            )->execute([
                $parsed['analysis']['teamA'],
                $parsed['analysis']['teamB'],
                $parsed['analysis']['predictedWinner'],
                $parsed['result']['winner'],
                $parsed['result']['mvp'],
                $mvpCharacterId,
                $rawText,
                $id,
            ]);

            $insertLog = $pdo->prepare(
                'INSERT INTO battle_logs (battle_id, turn, message, sort_order) VALUES (?, ?, ?, ?)'
            );
            foreach (array_values($parsed['battleLog']) as $index => $entry) {
                $insertLog->execute([$id, $entry['turn'], $entry['message'], $index]);
            }

            $insertEvent = $pdo->prepare(
                'INSERT INTO battle_events (battle_id, turn, event_type, character_name, effect, raw_json, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            foreach (array_values($parsed['events']) as $index => $event) {
                $insertEvent->execute([
                    $id,
                    extract_event_turn($event),
                    $event['type'] ?? null,
                    $event['character'] ?? null,
                    $event['effect'] ?? null,
                    json_encode($event, JSON_UNESCAPED_UNICODE),
                    $index,
                ]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        json_response(['ok' => true]);
    }

    if ($action === 'mark-failed' && $id !== null) {
        $pdo->prepare("UPDATE battles SET status = 'failed', error_message = ? WHERE id = ?")
            ->execute([$input['errorMessage'], $id]);
        json_response(['ok' => true]);
    }

    json_error('不正なリクエストです。', 400);
}

json_error('サポートされていないリクエストです。', 405);
