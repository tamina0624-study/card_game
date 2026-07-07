<?php

/**
 * ストーリーエンドポイント(`src/lib/stories/repository.ts` のPHP版)。
 *
 * 「誰としてログインしているか」の解決はNext.js側(`lib/auth/session.ts`)の責務であり、
 * ここでは解決済みの `userId` をプレーンな値として受け取るのみ(`battles.php` の
 * `mvpCharacterId` と同じ方針)。AI呼び出し(Claude/OpenRouter)もNext.js側で行い、
 * ここは生成結果の永続化のみを担当する。
 *
 * GET (id無し, userId任意)      = 公開済み章の一覧(`userId`指定時は各章のプレイ済み日時を付与)
 * GET (id=, userId任意)         = 章の詳細(`userId`指定時はその章のプレイ内容も含む)
 * GET action=my-plays&userId=   = ユーザーの全プレイ履歴(振り返り一覧、章番号順)
 * POST action=create-chapter    = 新しい章を追加(ADMIN_KEY保護。毎週の追加を想定)
 * POST action=save-play         = AI生成済みの個別化ストーリー本文を保存(冪等、既存なら何もしない)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/stories.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = $method === 'POST' ? read_json_body() : null;
$action = $input['action'] ?? ($_GET['action'] ?? null);

if ($action === 'create-chapter') {
    require_admin_key();
} else {
    require_api_key();
}

$pdo = get_pdo();
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$userId = isset($_GET['userId']) ? (int) $_GET['userId'] : null;

if ($method === 'GET' && $action === 'my-plays') {
    if ($userId === null) {
        json_error('userIdを指定してください。', 400);
    }
    $stmt = $pdo->prepare(
        'SELECT p.*, c.chapter_number, c.title AS chapter_title
         FROM story_plays p
         JOIN story_chapters c ON c.id = p.story_chapter_id
         WHERE p.user_id = ?
         ORDER BY c.chapter_number ASC'
    );
    $stmt->execute([$userId]);
    json_response(array_map(function ($row) {
        $play = assemble_play($row);
        $play['chapterNumber'] = (int) $row['chapter_number'];
        $play['chapterTitle'] = $row['chapter_title'];
        return $play;
    }, $stmt->fetchAll()));
}

if ($method === 'GET' && $id === null) {
    $stmt = $pdo->prepare(
        'SELECT * FROM story_chapters WHERE published_at <= UTC_TIMESTAMP() ORDER BY chapter_number ASC'
    );
    $stmt->execute();
    $chapters = $stmt->fetchAll();

    $playedAtByChapterId = [];
    if ($userId !== null) {
        $playStmt = $pdo->prepare('SELECT story_chapter_id, created_at FROM story_plays WHERE user_id = ?');
        $playStmt->execute([$userId]);
        foreach ($playStmt->fetchAll() as $playRow) {
            $playedAtByChapterId[(int) $playRow['story_chapter_id']] = $playRow['created_at'];
        }
    }

    json_response(array_map(
        fn($row) => assemble_chapter($row, $playedAtByChapterId[(int) $row['id']] ?? null),
        $chapters
    ));
}

if ($method === 'GET' && $id !== null) {
    $stmt = $pdo->prepare('SELECT * FROM story_chapters WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('ストーリーが見つかりません。', 404);
    }

    $play = null;
    if ($userId !== null) {
        $playStmt = $pdo->prepare('SELECT * FROM story_plays WHERE user_id = ? AND story_chapter_id = ?');
        $playStmt->execute([$userId, $id]);
        $playRow = $playStmt->fetch();
        $play = $playRow ? assemble_play($playRow) : null;
    }

    $chapter = assemble_chapter($row, $play['createdAt'] ?? null);
    $chapter['play'] = $play;
    json_response($chapter);
}

if ($method === 'POST' && $action === 'create-chapter') {
    $chapterNumber = (int) ($input['chapterNumber'] ?? 0);
    $title = trim((string) ($input['title'] ?? ''));
    $outline = trim((string) ($input['outline'] ?? ''));
    if ($chapterNumber <= 0 || $title === '' || $outline === '') {
        json_error('chapterNumber・title・outlineを指定してください。', 400);
    }

    $stmt = $pdo->prepare('SELECT 1 FROM story_chapters WHERE chapter_number = ?');
    $stmt->execute([$chapterNumber]);
    if ($stmt->fetch()) {
        json_error("章番号({$chapterNumber})は既に使われています。", 409, 'CHAPTER_NUMBER_TAKEN');
    }

    $publishedAt = isset($input['publishedAt']) && $input['publishedAt'] !== null
        ? $input['publishedAt']
        : null;

    if ($publishedAt !== null) {
        $pdo->prepare(
            'INSERT INTO story_chapters (chapter_number, title, outline, published_at) VALUES (?, ?, ?, ?)'
        )->execute([$chapterNumber, $title, $outline, $publishedAt]);
    } else {
        $pdo->prepare(
            'INSERT INTO story_chapters (chapter_number, title, outline) VALUES (?, ?, ?)'
        )->execute([$chapterNumber, $title, $outline]);
    }
    $chapterId = (int) $pdo->lastInsertId();

    $stmt = $pdo->prepare('SELECT * FROM story_chapters WHERE id = ?');
    $stmt->execute([$chapterId]);
    $chapter = assemble_chapter($stmt->fetch());
    $chapter['play'] = null;
    json_response($chapter, 201);
}

if ($method === 'POST' && $action === 'save-play') {
    $userId = (int) ($input['userId'] ?? 0);
    $chapterId = (int) ($input['chapterId'] ?? 0);
    $content = (string) ($input['content'] ?? '');
    $rawAiResponse = isset($input['rawAiResponse']) ? (string) $input['rawAiResponse'] : null;

    if ($userId <= 0 || $chapterId <= 0 || $content === '') {
        json_error('userId・chapterId・contentを指定してください。', 400);
    }

    $pdo->prepare(
        'INSERT IGNORE INTO story_plays (user_id, story_chapter_id, content, raw_ai_response)
         VALUES (?, ?, ?, ?)'
    )->execute([$userId, $chapterId, $content, $rawAiResponse]);

    $stmt = $pdo->prepare('SELECT * FROM story_plays WHERE user_id = ? AND story_chapter_id = ?');
    $stmt->execute([$userId, $chapterId]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('ストーリー(id=' . $chapterId . ')が見つかりません。', 404);
    }
    json_response(assemble_play($row), 201);
}

json_error('サポートされていないリクエストです。', 405);
