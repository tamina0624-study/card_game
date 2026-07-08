<?php

/**
 * ストーリー機能の組み立てヘルパー(`stories.php` から共有)。
 *
 * 章内に複数の「ストーリー」「戦闘イベント」を任意の順序で登録できる設計
 * (`story_chapters` = 章の大枠、`story_beats` = 章内に順序付きで並ぶストーリー/戦闘イベント、
 * `story_beat_progress` = ユーザーごとのビート進捗、`story_blessings` = 章内の戦闘への
 * 挑戦回数)を扱う。
 */

/**
 * `story_chapters` 1行を組み立てる。
 * `playedAt` はそのユーザーがこの章のいずれかのビートに初めて着手した日時
 * (`story_beat_progress.created_at` の最小値、未着手なら`null`)。
 * `locked` は前章クリア判定の結果(呼び出し元が `compute_chapter_locked_map` で
 * 計算済みの値をそのまま渡す)。
 */
function assemble_chapter(array $row, ?string $playedAt, bool $locked): array
{
    return [
        'id' => (int) $row['id'],
        'chapterNumber' => (int) $row['chapter_number'],
        'title' => $row['title'],
        'outline' => $row['outline'],
        'publishedAt' => $row['published_at'],
        'playedAt' => $playedAt,
        'mascotCharacterId' => $row['mascot_character_id'] !== null ? (int) $row['mascot_character_id'] : null,
        'locked' => $locked,
    ];
}

/**
 * `story_beats` 1行(+そのユーザーの進捗行、あれば)を組み立てる。
 * `content`/`clearedAt` は `beat_type='story'` の場合はAI個別化本文・生成日時、
 * `beat_type='battle'` の場合は常に `content: null`、勝利時刻のみ`clearedAt`に入る。
 */
function assemble_beat(array $row, ?array $progressRow, bool $locked): array
{
    return [
        'id' => (int) $row['id'],
        'chapterId' => (int) $row['story_chapter_id'],
        'sortOrder' => (int) $row['sort_order'],
        'beatType' => $row['beat_type'],
        'title' => $row['title'],
        'outline' => $row['outline'],
        'deckId' => $row['deck_id'] !== null ? (int) $row['deck_id'] : null,
        'locked' => $locked,
        'content' => $progressRow['content'] ?? null,
        'createdAt' => $progressRow['created_at'] ?? null,
        'clearedAt' => $progressRow['cleared_at'] ?? null,
    ];
}

/** `story_blessings` 1行を組み立てる。まだ1回も挑戦していない場合は呼び出し元で `battleCount: 0` を組み立てる。 */
function assemble_blessing(int $chapterId, int $battleCount): array
{
    return [
        'chapterId' => $chapterId,
        'battleCount' => $battleCount,
    ];
}

/**
 * 指定ユーザーについて、`story_beat_id => cleared_at`(非NULLなら完了済み)のマップを返す。
 * `beatIds` が空の場合は空配列を返す。
 */
function fetch_cleared_beat_ids(PDO $pdo, array $beatIds, int $userId): array
{
    if ($beatIds === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($beatIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT story_beat_id FROM story_beat_progress
         WHERE user_id = ? AND story_beat_id IN ({$placeholders}) AND cleared_at IS NOT NULL"
    );
    $stmt->execute([$userId, ...$beatIds]);
    $cleared = [];
    foreach ($stmt->fetchAll() as $row) {
        $cleared[(int) $row['story_beat_id']] = true;
    }
    return $cleared;
}

/**
 * 章内のビート(`sort_order` 昇順で渡されること前提)それぞれについて、指定ユーザーから
 * 見たロック状態を計算する。先頭のビートは章自体のロック状態(`$chapterLocked`)を引き継ぎ、
 * 2番目以降は「直前のビートが完了済みか」で判定する。ビートが1件も無い章は空配列を返す。
 *
 * 戻り値は `story_beats.id => bool(locked)` のマップ。
 */
function compute_beat_locked_map(PDO $pdo, array $beatRows, ?int $userId, bool $chapterLocked): array
{
    $locked = [];
    if ($beatRows === []) {
        return $locked;
    }
    if ($userId === null) {
        foreach ($beatRows as $row) {
            $locked[(int) $row['id']] = true;
        }
        return $locked;
    }

    $beatIds = array_map(fn($row) => (int) $row['id'], $beatRows);
    $clearedBeatIds = fetch_cleared_beat_ids($pdo, $beatIds, $userId);

    $previousCleared = !$chapterLocked;
    foreach ($beatRows as $row) {
        $id = (int) $row['id'];
        $locked[$id] = !$previousCleared;
        $previousCleared = isset($clearedBeatIds[$id]);
    }
    return $locked;
}

/**
 * 公開済み章(`chapter_number` 昇順で渡されること前提)それぞれについて、指定ユーザーから
 * 見たロック状態を計算する。先頭の章は常に解放、2章目以降は「直前の章の最後のビートが
 * 完了済みか」で判定する(ビートが1件も無い章は「クリア済み扱い」とし、後続の章を
 * ブロックしない)。`userId` が `null`(未ログイン)の場合はすべて `true`(未解放)を返す。
 *
 * 戻り値は `story_chapters.id => bool(locked)` のマップ。
 */
function compute_chapter_locked_map(PDO $pdo, array $chapterRows, ?int $userId): array
{
    $locked = [];
    if ($userId === null) {
        foreach ($chapterRows as $row) {
            $locked[(int) $row['id']] = true;
        }
        return $locked;
    }

    $chapterIds = array_map(fn($row) => (int) $row['id'], $chapterRows);
    $lastBeatIdByChapter = [];
    if ($chapterIds !== []) {
        $placeholders = implode(',', array_fill(0, count($chapterIds), '?'));
        // 各章内で `sort_order` (同値ならid) が最大のビートを「最後のビート」とする。
        $stmt = $pdo->prepare(
            "SELECT story_chapter_id, id FROM story_beats
             WHERE story_chapter_id IN ({$placeholders})
             ORDER BY story_chapter_id ASC, sort_order ASC, id ASC"
        );
        $stmt->execute($chapterIds);
        foreach ($stmt->fetchAll() as $row) {
            // 昇順で上書きしていくことで、最終的に各章ごとの最後の行が残る。
            $lastBeatIdByChapter[(int) $row['story_chapter_id']] = (int) $row['id'];
        }
    }

    $clearedBeatIds = fetch_cleared_beat_ids($pdo, array_values($lastBeatIdByChapter), $userId);

    $previousCleared = true;
    foreach ($chapterRows as $row) {
        $id = (int) $row['id'];
        $locked[$id] = !$previousCleared;
        $lastBeatId = $lastBeatIdByChapter[$id] ?? null;
        // ビートが1件も無い章は完了扱い(後続の章をブロックしない)。
        $previousCleared = $lastBeatId === null ? true : isset($clearedBeatIds[$lastBeatId]);
    }
    return $locked;
}

/** 指定ユーザーがこの章のいずれかのビートに初めて着手した日時(`story_beat_progress.created_at`の最小値)。未着手なら`null`。 */
function fetch_chapter_started_at(PDO $pdo, int $chapterId, int $userId): ?string
{
    $stmt = $pdo->prepare(
        'SELECT MIN(p.created_at) AS started_at
         FROM story_beat_progress p
         JOIN story_beats b ON b.id = p.story_beat_id
         WHERE b.story_chapter_id = ? AND p.user_id = ?'
    );
    $stmt->execute([$chapterId, $userId]);
    $row = $stmt->fetch();
    return $row && $row['started_at'] !== null ? $row['started_at'] : null;
}
