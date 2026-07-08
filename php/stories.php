<?php

/**
 * ストーリーエンドポイント(`src/lib/stories/repository.ts` のPHP版)。
 *
 * 「誰としてログインしているか」の解決はNext.js側(`lib/auth/session.ts`)の責務であり、
 * ここでは解決済みの `userId` をプレーンな値として受け取るのみ(`battles.php` の
 * `mvpCharacterId` と同じ方針)。AI呼び出し(Claude/OpenRouter)もNext.js側で行い、
 * ここは生成結果の永続化のみを担当する。
 *
 * GET (id無し, userId任意)      = 公開済み章の一覧(`userId`指定時は各章の`playedAt`・
 *                                  `locked`(前章クリア判定)を付与)
 * GET (id=, userId任意)         = 章の詳細(`userId`指定時はその章のプレイ内容・`locked`も含む)
 * GET action=my-plays&userId=   = ユーザーの全プレイ履歴(振り返り一覧、章番号順)
 * GET action=get-blessing&userId=&chapterId= = 章内の雑魚戦・ボス戦への挑戦回数(祝福度)
 * POST action=create-chapter    = 新しい章を追加(ADMIN_KEY保護。毎週の追加を想定。
 *                                  任意で`mascotCharacterId`/`mobDeckId`/`bossDeckId`を指定できる)
 * POST action=save-play         = AI生成済みの個別化ストーリー本文を保存(冪等、既存なら何もしない。
 *                                  その章にボス戦が無ければ保存と同時にクリア扱いにする)
 * POST action=mark-cleared      = ボス戦勝利時に章をクリア扱いにする(冪等)
 * POST action=increment-blessing = 章内の雑魚戦・ボス戦に1回挑戦したことを記録する(勝敗問わず)
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

if ($method === 'GET' && $action === 'get-blessing') {
    if ($userId === null) {
        json_error('userIdを指定してください。', 400);
    }
    $chapterId = isset($_GET['chapterId']) ? (int) $_GET['chapterId'] : null;
    if ($chapterId === null) {
        json_error('chapterIdを指定してください。', 400);
    }
    $stmt = $pdo->prepare(
        'SELECT battle_count FROM story_blessings WHERE user_id = ? AND story_chapter_id = ?'
    );
    $stmt->execute([$userId, $chapterId]);
    $row = $stmt->fetch();
    json_response(assemble_blessing($chapterId, $row ? (int) $row['battle_count'] : 0));
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

    $lockedMap = compute_locked_map($pdo, $chapters, $userId);

    json_response(array_map(
        fn($row) => assemble_chapter(
            $row,
            $playedAtByChapterId[(int) $row['id']] ?? null,
            $lockedMap[(int) $row['id']] ?? true
        ),
        $chapters
    ));
}

if ($method === 'GET' && $id !== null) {
    // ロック判定は「進行順」である`chapter_number`の並びで前章のクリア状況を
    // たどる必要があるため、全章(未公開含む)を`chapter_number`昇順で取得したうえで
    // 対象の章を探す(`compute_locked_map`参照)。
    $allChapters = $pdo->query('SELECT * FROM story_chapters ORDER BY chapter_number ASC')->fetchAll();
    $row = null;
    foreach ($allChapters as $candidate) {
        if ((int) $candidate['id'] === $id) {
            $row = $candidate;
            break;
        }
    }
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

    $lockedMap = compute_locked_map($pdo, $allChapters, $userId);
    $chapter = assemble_chapter($row, $play['createdAt'] ?? null, $lockedMap[$id] ?? true);
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

    $mascotCharacterId = isset($input['mascotCharacterId']) && $input['mascotCharacterId'] !== null
        ? (int) $input['mascotCharacterId']
        : null;
    if ($mascotCharacterId !== null) {
        $check = $pdo->prepare('SELECT 1 FROM characters WHERE id = ?');
        $check->execute([$mascotCharacterId]);
        if (!$check->fetch()) {
            json_error("マスコットキャラクター(id={$mascotCharacterId})が見つかりません。", 400);
        }
    }

    $mobDeckId = isset($input['mobDeckId']) && $input['mobDeckId'] !== null ? (int) $input['mobDeckId'] : null;
    $bossDeckId = isset($input['bossDeckId']) && $input['bossDeckId'] !== null ? (int) $input['bossDeckId'] : null;
    foreach (['mobDeckId' => $mobDeckId, 'bossDeckId' => $bossDeckId] as $label => $deckId) {
        if ($deckId === null) {
            continue;
        }
        $check = $pdo->prepare('SELECT 1 FROM decks WHERE id = ?');
        $check->execute([$deckId]);
        if (!$check->fetch()) {
            json_error("{$label}(id={$deckId})に該当するデッキが見つかりません。", 400);
        }
    }

    $publishedAt = isset($input['publishedAt']) && $input['publishedAt'] !== null
        ? $input['publishedAt']
        : null;

    if ($publishedAt !== null) {
        $pdo->prepare(
            'INSERT INTO story_chapters
               (chapter_number, title, outline, mascot_character_id, mob_deck_id, boss_deck_id, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$chapterNumber, $title, $outline, $mascotCharacterId, $mobDeckId, $bossDeckId, $publishedAt]);
    } else {
        $pdo->prepare(
            'INSERT INTO story_chapters
               (chapter_number, title, outline, mascot_character_id, mob_deck_id, boss_deck_id)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$chapterNumber, $title, $outline, $mascotCharacterId, $mobDeckId, $bossDeckId]);
    }
    $chapterId = (int) $pdo->lastInsertId();

    // 雑魚戦・ボス戦のデッキとして紐付けられたデッキは、通常のPvP対戦セットアップ画面の
    // 対戦相手プルダウンに出てこないよう `is_story_enemy` を立てる(`decks.php` 参照)。
    // デッキ作成時に付け忘れていても、章に紐付けた時点で必ず隠れるようにする安全策。
    $enemyDeckIds = array_values(array_filter([$mobDeckId, $bossDeckId], fn($v) => $v !== null));
    if ($enemyDeckIds !== []) {
        $placeholders = implode(',', array_fill(0, count($enemyDeckIds), '?'));
        $pdo->prepare("UPDATE decks SET is_story_enemy = 1 WHERE id IN ({$placeholders})")
            ->execute($enemyDeckIds);
    }

    $stmt = $pdo->prepare('SELECT * FROM story_chapters WHERE id = ?');
    $stmt->execute([$chapterId]);
    $chapter = assemble_chapter($stmt->fetch(), null, false);
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

    $chapterStmt = $pdo->prepare('SELECT boss_deck_id FROM story_chapters WHERE id = ?');
    $chapterStmt->execute([$chapterId]);
    $chapterRow = $chapterStmt->fetch();
    if (!$chapterRow) {
        json_error('ストーリー(id=' . $chapterId . ')が見つかりません。', 404);
    }

    $pdo->prepare(
        'INSERT IGNORE INTO story_plays (user_id, story_chapter_id, content, raw_ai_response)
         VALUES (?, ?, ?, ?)'
    )->execute([$userId, $chapterId, $content, $rawAiResponse]);

    // ボス戦が設定されていない章は、従来通り「物語を生成した時点でクリア」とする
    // (`compute_locked_map`が次章の解放判定に使う)。
    if ($chapterRow['boss_deck_id'] === null) {
        $pdo->prepare(
            'UPDATE story_plays SET cleared_at = created_at
             WHERE user_id = ? AND story_chapter_id = ? AND cleared_at IS NULL'
        )->execute([$userId, $chapterId]);
    }

    $stmt = $pdo->prepare('SELECT * FROM story_plays WHERE user_id = ? AND story_chapter_id = ?');
    $stmt->execute([$userId, $chapterId]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('ストーリー(id=' . $chapterId . ')が見つかりません。', 404);
    }
    json_response(assemble_play($row), 201);
}

if ($method === 'POST' && $action === 'mark-cleared') {
    $userId = (int) ($input['userId'] ?? 0);
    $chapterId = (int) ($input['chapterId'] ?? 0);
    if ($userId <= 0 || $chapterId <= 0) {
        json_error('userId・chapterIdを指定してください。', 400);
    }

    $stmt = $pdo->prepare('SELECT * FROM story_plays WHERE user_id = ? AND story_chapter_id = ?');
    $stmt->execute([$userId, $chapterId]);
    if (!$stmt->fetch()) {
        json_error('この章のプレイ記録(物語)がまだありません。', 404);
    }

    $pdo->prepare(
        'UPDATE story_plays SET cleared_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND story_chapter_id = ? AND cleared_at IS NULL'
    )->execute([$userId, $chapterId]);

    $stmt->execute([$userId, $chapterId]);
    json_response(assemble_play($stmt->fetch()));
}

if ($method === 'POST' && $action === 'increment-blessing') {
    $userId = (int) ($input['userId'] ?? 0);
    $chapterId = (int) ($input['chapterId'] ?? 0);
    if ($userId <= 0 || $chapterId <= 0) {
        json_error('userId・chapterIdを指定してください。', 400);
    }

    $pdo->prepare(
        'INSERT INTO story_blessings (user_id, story_chapter_id, battle_count)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE battle_count = battle_count + 1'
    )->execute([$userId, $chapterId]);

    $stmt = $pdo->prepare(
        'SELECT battle_count FROM story_blessings WHERE user_id = ? AND story_chapter_id = ?'
    );
    $stmt->execute([$userId, $chapterId]);
    json_response(assemble_blessing($chapterId, (int) $stmt->fetch()['battle_count']), 201);
}

json_error('サポートされていないリクエストです。', 405);
