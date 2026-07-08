<?php

/**
 * ストーリーエンドポイント(`src/lib/stories/repository.ts` のPHP版)。
 *
 * 章(`story_chapters`)の中に、順序付きの「ストーリー」「戦闘イベント」ビート
 * (`story_beats`)を任意の数だけ登録できる設計。`beat_type='story'` は `outline`
 * (あらすじ、AIが個別化する元ネタ)を、`beat_type='battle'` は `deck_id`(対戦相手デッキ)を持つ。
 * 章内のビートは `sort_order` 順に1つずつ解放され、直前のビートが完了(story=生成済み、
 * battle=勝利済み)して初めて次のビートに挑戦・閲覧できる。章そのもののロックは
 * 「直前の章の最後のビートが完了しているか」で判定する(`compute_chapter_locked_map`)。
 *
 * 「誰としてログインしているか」の解決はNext.js側(`lib/auth/session.ts`)の責務であり、
 * ここでは解決済みの `userId` をプレーンな値として受け取るのみ。AI呼び出し
 * (Claude/OpenRouter)もNext.js側で行い、ここは生成結果の永続化のみを担当する。
 *
 * GET (id無し, userId任意)      = 公開済み章の一覧(`userId`指定時は各章の`playedAt`・`locked`を付与)
 * GET (id=, userId任意)         = 章の詳細(`beats`配列。`userId`指定時は各ビートの進捗・`locked`も含む)
 * GET action=get-beat&id=&userId= = ビート単体の詳細(Next.jsのplay/battle Route Handlerが使う)
 * GET action=my-plays&userId=   = ユーザーの全プレイ履歴(振り返り一覧、章番号順)
 * GET action=get-blessing&userId=&chapterId= = 章内の戦闘への挑戦回数(祝福度)
 * POST action=create-chapter    = 新しい章を追加(ADMIN_KEY保護。任意で`beats`配列を
 *                                  同時登録できる: [{beatType, title, outline?, deckId?}, ...])
 * POST action=add-beat          = 既存の章の末尾にビートを1件追加する(ADMIN_KEY保護)
 * POST action=update-beat       = 既存ビートのtitle/outline/deckIdを更新する(ADMIN_KEY保護。
 *                                  戦闘ビート登録後にdeckIdを後付けする用途を想定)
 * POST action=play-beat         = AI生成済みの個別化ストーリー本文を保存する(story向け、冪等)
 * POST action=mark-beat-cleared = 戦闘ビート勝利時にそのビートを完了扱いにする(battle向け、冪等)
 * POST action=increment-blessing = 章内の戦闘に1回挑戦したことを記録する(勝敗問わず)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/stories.php';

/** チャプター1件を取得する(存在しなければ`null`)。 */
function find_chapter(PDO $pdo, int $chapterId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM story_chapters WHERE id = ?');
    $stmt->execute([$chapterId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/** 章内のビート一覧を`sort_order`昇順(同値ならid昇順)で取得する。 */
function fetch_beats(PDO $pdo, int $chapterId): array
{
    $stmt = $pdo->prepare(
        'SELECT * FROM story_beats WHERE story_chapter_id = ? ORDER BY sort_order ASC, id ASC'
    );
    $stmt->execute([$chapterId]);
    return $stmt->fetchAll();
}

/** 指定ユーザーの、指定ビートID群についての進捗行を `story_beat_id => row` のマップで返す。 */
function fetch_progress_map(PDO $pdo, array $beatIds, int $userId): array
{
    if ($beatIds === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($beatIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT * FROM story_beat_progress WHERE user_id = ? AND story_beat_id IN ({$placeholders})"
    );
    $stmt->execute([$userId, ...$beatIds]);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[(int) $row['story_beat_id']] = $row;
    }
    return $map;
}

/** ビート登録入力(`beatType`/`title`/`outline`/`deckId`)を検証する。不正なら`json_error`で終了する。 */
function validate_beat_input(PDO $pdo, $beat, $index): void
{
    if (!is_array($beat)) {
        json_error("beats[{$index}]が不正です。", 400);
    }
    $beatType = $beat['beatType'] ?? null;
    if ($beatType !== 'story' && $beatType !== 'battle') {
        json_error("beats[{$index}].beatTypeは'story'または'battle'を指定してください。", 400);
    }
    $title = trim((string) ($beat['title'] ?? ''));
    if ($title === '') {
        json_error("beats[{$index}].titleを指定してください。", 400);
    }
    if ($beatType === 'story') {
        $outline = trim((string) ($beat['outline'] ?? ''));
        if ($outline === '') {
            json_error("beats[{$index}].outline(story向け)を指定してください。", 400);
        }
    }
    if ($beatType === 'battle' && isset($beat['deckId']) && $beat['deckId'] !== null) {
        $check = $pdo->prepare('SELECT 1 FROM decks WHERE id = ?');
        $check->execute([(int) $beat['deckId']]);
        if (!$check->fetch()) {
            json_error("beats[{$index}].deckId(id={$beat['deckId']})に該当するデッキが見つかりません。", 400);
        }
    }
}

/** 検証済みのビート入力をDBへINSERTする。`beat_type='battle'`でdeckId指定時はそのデッキを`is_story_enemy=1`にする。 */
function insert_beat(PDO $pdo, int $chapterId, array $beat, int $sortOrder): void
{
    $beatType = $beat['beatType'];
    $title = trim((string) $beat['title']);
    $outline = $beatType === 'story' ? trim((string) ($beat['outline'] ?? '')) : null;
    $deckId = $beatType === 'battle' && isset($beat['deckId']) && $beat['deckId'] !== null
        ? (int) $beat['deckId']
        : null;

    $pdo->prepare(
        'INSERT INTO story_beats (story_chapter_id, sort_order, beat_type, title, outline, deck_id)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$chapterId, $sortOrder, $beatType, $title, $outline, $deckId]);

    if ($deckId !== null) {
        // 戦闘ビートの対戦相手として紐付けられたデッキは、通常のPvP対戦セットアップ画面の
        // 対戦相手プルダウンに出てこないよう `is_story_enemy` を立てる(`decks.php` 参照)。
        $pdo->prepare('UPDATE decks SET is_story_enemy = 1 WHERE id = ?')->execute([$deckId]);
    }
}

/** `play-beat`/`mark-beat-cleared`のレスポンス形状(`StoryBeat`の進捗部分のみ)。 */
function assemble_beat_progress(int $beatId, array $row): array
{
    return [
        'beatId' => $beatId,
        'content' => $row['content'] ?? null,
        'createdAt' => $row['created_at'],
        'clearedAt' => $row['cleared_at'] ?? null,
    ];
}

$method = $_SERVER['REQUEST_METHOD'];
$input = $method === 'POST' ? read_json_body() : null;
$action = $input['action'] ?? ($_GET['action'] ?? null);

$adminActions = ['create-chapter', 'add-beat', 'update-beat'];
if (in_array($action, $adminActions, true)) {
    require_admin_key();
} else {
    require_api_key();
}

$pdo = get_pdo();
$id = isset($_GET['id']) ? (int) $_GET['id'] : null;
$userId = isset($_GET['userId']) ? (int) $_GET['userId'] : null;

if ($method === 'GET' && $action === 'get-beat') {
    if ($id === null) {
        json_error('idを指定してください。', 400);
    }
    $beatStmt = $pdo->prepare('SELECT * FROM story_beats WHERE id = ?');
    $beatStmt->execute([$id]);
    $beatRow = $beatStmt->fetch();
    if (!$beatRow) {
        json_error('ストーリー/戦闘イベントが見つかりません。', 404);
    }
    $chapterId = (int) $beatRow['story_chapter_id'];
    $chapter = find_chapter($pdo, $chapterId);
    if (!$chapter) {
        json_error('ストーリーが見つかりません。', 404);
    }

    $allChapters = $pdo->query('SELECT * FROM story_chapters ORDER BY chapter_number ASC')->fetchAll();
    $chapterLockedMap = compute_chapter_locked_map($pdo, $allChapters, $userId);
    $chapterLocked = $chapterLockedMap[$chapterId] ?? true;

    $beats = fetch_beats($pdo, $chapterId);
    $beatLockedMap = compute_beat_locked_map($pdo, $beats, $userId, $chapterLocked);

    $progressRow = null;
    if ($userId !== null) {
        $progressStmt = $pdo->prepare(
            'SELECT * FROM story_beat_progress WHERE user_id = ? AND story_beat_id = ?'
        );
        $progressStmt->execute([$userId, $id]);
        $progressRow = $progressStmt->fetch() ?: null;
    }

    $beat = assemble_beat($beatRow, $progressRow, $beatLockedMap[$id] ?? true);
    $beat['chapterNumber'] = (int) $chapter['chapter_number'];
    $beat['mascotCharacterId'] = $chapter['mascot_character_id'] !== null ? (int) $chapter['mascot_character_id'] : null;
    json_response($beat);
}

if ($method === 'GET' && $action === 'my-plays') {
    if ($userId === null) {
        json_error('userIdを指定してください。', 400);
    }
    $stmt = $pdo->prepare(
        'SELECT sc.id AS chapter_id, sc.chapter_number, sc.title AS chapter_title,
            MIN(sbp.created_at) AS started_at
         FROM story_beat_progress sbp
         JOIN story_beats sb ON sb.id = sbp.story_beat_id
         JOIN story_chapters sc ON sc.id = sb.story_chapter_id
         WHERE sbp.user_id = ?
         GROUP BY sc.id, sc.chapter_number, sc.title
         ORDER BY sc.chapter_number ASC'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();

    json_response(array_map(function ($row) use ($pdo, $userId) {
        $chapterId = (int) $row['chapter_id'];
        $lastBeatStmt = $pdo->prepare(
            'SELECT id FROM story_beats WHERE story_chapter_id = ? ORDER BY sort_order DESC, id DESC LIMIT 1'
        );
        $lastBeatStmt->execute([$chapterId]);
        $lastBeat = $lastBeatStmt->fetch();
        $clearedAt = null;
        if ($lastBeat) {
            $clearedStmt = $pdo->prepare(
                'SELECT cleared_at FROM story_beat_progress WHERE user_id = ? AND story_beat_id = ?'
            );
            $clearedStmt->execute([$userId, (int) $lastBeat['id']]);
            $clearedRow = $clearedStmt->fetch();
            $clearedAt = $clearedRow['cleared_at'] ?? null;
        }
        return [
            'chapterId' => $chapterId,
            'chapterNumber' => (int) $row['chapter_number'],
            'chapterTitle' => $row['chapter_title'],
            'startedAt' => $row['started_at'],
            'clearedAt' => $clearedAt,
        ];
    }, $rows));
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

    $startedAtByChapterId = [];
    if ($userId !== null) {
        $playStmt = $pdo->prepare(
            'SELECT sb.story_chapter_id AS chapter_id, MIN(sbp.created_at) AS started_at
             FROM story_beat_progress sbp
             JOIN story_beats sb ON sb.id = sbp.story_beat_id
             WHERE sbp.user_id = ?
             GROUP BY sb.story_chapter_id'
        );
        $playStmt->execute([$userId]);
        foreach ($playStmt->fetchAll() as $playRow) {
            $startedAtByChapterId[(int) $playRow['chapter_id']] = $playRow['started_at'];
        }
    }

    $lockedMap = compute_chapter_locked_map($pdo, $chapters, $userId);

    json_response(array_map(
        fn($row) => assemble_chapter(
            $row,
            $startedAtByChapterId[(int) $row['id']] ?? null,
            $lockedMap[(int) $row['id']] ?? true
        ),
        $chapters
    ));
}

if ($method === 'GET' && $id !== null) {
    // ロック判定は「進行順」である`chapter_number`の並びで前章のクリア状況を
    // たどる必要があるため、全章(未公開含む)を`chapter_number`昇順で取得したうえで
    // 対象の章を探す(`compute_chapter_locked_map`参照)。
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

    $lockedMap = compute_chapter_locked_map($pdo, $allChapters, $userId);
    $chapterLocked = $lockedMap[$id] ?? true;

    $startedAt = $userId !== null ? fetch_chapter_started_at($pdo, $id, $userId) : null;
    $chapter = assemble_chapter($row, $startedAt, $chapterLocked);

    $beatRows = fetch_beats($pdo, $id);
    $beatLockedMap = compute_beat_locked_map($pdo, $beatRows, $userId, $chapterLocked);
    $progressMap = $userId !== null
        ? fetch_progress_map($pdo, array_map(fn($b) => (int) $b['id'], $beatRows), $userId)
        : [];

    $chapter['beats'] = array_map(
        fn($beatRow) => assemble_beat(
            $beatRow,
            $progressMap[(int) $beatRow['id']] ?? null,
            $beatLockedMap[(int) $beatRow['id']] ?? true
        ),
        $beatRows
    );
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

    $beats = is_array($input['beats'] ?? null) ? array_values($input['beats']) : [];
    foreach ($beats as $index => $beat) {
        validate_beat_input($pdo, $beat, $index);
    }

    $publishedAt = isset($input['publishedAt']) && $input['publishedAt'] !== null
        ? $input['publishedAt']
        : null;

    if ($publishedAt !== null) {
        $pdo->prepare(
            'INSERT INTO story_chapters (chapter_number, title, outline, mascot_character_id, published_at)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$chapterNumber, $title, $outline, $mascotCharacterId, $publishedAt]);
    } else {
        $pdo->prepare(
            'INSERT INTO story_chapters (chapter_number, title, outline, mascot_character_id)
             VALUES (?, ?, ?, ?)'
        )->execute([$chapterNumber, $title, $outline, $mascotCharacterId]);
    }
    $chapterId = (int) $pdo->lastInsertId();

    foreach ($beats as $index => $beat) {
        insert_beat($pdo, $chapterId, $beat, $index);
    }

    $stmt = $pdo->prepare('SELECT * FROM story_chapters WHERE id = ?');
    $stmt->execute([$chapterId]);
    $chapter = assemble_chapter($stmt->fetch(), null, false);
    $beatRows = fetch_beats($pdo, $chapterId);
    $chapter['beats'] = array_map(fn($row) => assemble_beat($row, null, false), $beatRows);
    json_response($chapter, 201);
}

if ($method === 'POST' && $action === 'add-beat') {
    $chapterId = (int) ($input['chapterId'] ?? 0);
    if ($chapterId <= 0) {
        json_error('chapterIdを指定してください。', 400);
    }
    $chapter = find_chapter($pdo, $chapterId);
    if (!$chapter) {
        json_error("章(id={$chapterId})が見つかりません。", 404);
    }
    validate_beat_input($pdo, $input, 0);

    $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM story_beats WHERE story_chapter_id = ?');
    $maxStmt->execute([$chapterId]);
    $nextSortOrder = ((int) $maxStmt->fetch()['max_order']) + 1;

    insert_beat($pdo, $chapterId, $input, $nextSortOrder);

    $stmt = $pdo->prepare('SELECT * FROM story_beats WHERE story_chapter_id = ? AND sort_order = ?');
    $stmt->execute([$chapterId, $nextSortOrder]);
    json_response(assemble_beat($stmt->fetch(), null, false), 201);
}

if ($method === 'POST' && $action === 'update-beat') {
    $beatId = (int) ($input['beatId'] ?? 0);
    if ($beatId <= 0) {
        json_error('beatIdを指定してください。', 400);
    }
    $beatStmt = $pdo->prepare('SELECT * FROM story_beats WHERE id = ?');
    $beatStmt->execute([$beatId]);
    $beat = $beatStmt->fetch();
    if (!$beat) {
        json_error("ビート(id={$beatId})が見つかりません。", 404);
    }

    $sets = [];
    $params = [];
    if (array_key_exists('title', $input)) {
        $title = trim((string) $input['title']);
        if ($title === '') {
            json_error('titleを空にはできません。', 400);
        }
        $sets[] = 'title = ?';
        $params[] = $title;
    }
    if (array_key_exists('outline', $input)) {
        $sets[] = 'outline = ?';
        $params[] = $input['outline'] !== null ? trim((string) $input['outline']) : null;
    }
    if (array_key_exists('deckId', $input)) {
        $deckId = $input['deckId'] !== null ? (int) $input['deckId'] : null;
        if ($deckId !== null) {
            $check = $pdo->prepare('SELECT 1 FROM decks WHERE id = ?');
            $check->execute([$deckId]);
            if (!$check->fetch()) {
                json_error("deckId(id={$deckId})に該当するデッキが見つかりません。", 400);
            }
            $pdo->prepare('UPDATE decks SET is_story_enemy = 1 WHERE id = ?')->execute([$deckId]);
        }
        $sets[] = 'deck_id = ?';
        $params[] = $deckId;
    }

    if ($sets !== []) {
        $params[] = $beatId;
        $pdo->prepare('UPDATE story_beats SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }

    $beatStmt->execute([$beatId]);
    json_response(assemble_beat($beatStmt->fetch(), null, false));
}

if ($method === 'POST' && $action === 'play-beat') {
    $userId = (int) ($input['userId'] ?? 0);
    $beatId = (int) ($input['beatId'] ?? 0);
    $content = (string) ($input['content'] ?? '');
    $rawAiResponse = isset($input['rawAiResponse']) ? (string) $input['rawAiResponse'] : null;

    if ($userId <= 0 || $beatId <= 0 || $content === '') {
        json_error('userId・beatId・contentを指定してください。', 400);
    }

    $beatStmt = $pdo->prepare('SELECT beat_type FROM story_beats WHERE id = ?');
    $beatStmt->execute([$beatId]);
    $beatRow = $beatStmt->fetch();
    if (!$beatRow) {
        json_error("ストーリー(id={$beatId})が見つかりません。", 404);
    }
    if ($beatRow['beat_type'] !== 'story') {
        json_error('このビートはストーリーではありません。', 400, 'NOT_A_STORY_BEAT');
    }

    // ストーリービートは生成(=閲覧)と同時に完了扱いにする(戦闘ビートと異なり、勝敗の概念が無いため)。
    $pdo->prepare(
        'INSERT IGNORE INTO story_beat_progress (user_id, story_beat_id, content, raw_ai_response, cleared_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())'
    )->execute([$userId, $beatId, $content, $rawAiResponse]);

    $stmt = $pdo->prepare('SELECT * FROM story_beat_progress WHERE user_id = ? AND story_beat_id = ?');
    $stmt->execute([$userId, $beatId]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error("ストーリー(id={$beatId})が見つかりません。", 404);
    }
    json_response(assemble_beat_progress($beatId, $row), 201);
}

if ($method === 'POST' && $action === 'mark-beat-cleared') {
    $userId = (int) ($input['userId'] ?? 0);
    $beatId = (int) ($input['beatId'] ?? 0);
    if ($userId <= 0 || $beatId <= 0) {
        json_error('userId・beatIdを指定してください。', 400);
    }

    $beatStmt = $pdo->prepare('SELECT beat_type FROM story_beats WHERE id = ?');
    $beatStmt->execute([$beatId]);
    $beatRow = $beatStmt->fetch();
    if (!$beatRow) {
        json_error("戦闘イベント(id={$beatId})が見つかりません。", 404);
    }
    if ($beatRow['beat_type'] !== 'battle') {
        json_error('このビートは戦闘イベントではありません。', 400, 'NOT_A_BATTLE_BEAT');
    }

    $pdo->prepare(
        'INSERT INTO story_beat_progress (user_id, story_beat_id, cleared_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE cleared_at = COALESCE(cleared_at, UTC_TIMESTAMP())'
    )->execute([$userId, $beatId]);

    $stmt = $pdo->prepare('SELECT * FROM story_beat_progress WHERE user_id = ? AND story_beat_id = ?');
    $stmt->execute([$userId, $beatId]);
    json_response(assemble_beat_progress($beatId, $stmt->fetch()));
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
