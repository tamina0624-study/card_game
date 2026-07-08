<?php

/**
 * ストーリー機能の組み立てヘルパー(`stories.php` から共有)。
 * `story_chapters`(毎週追加される固定の大枠)・`story_plays`
 * (ユーザーごとにAIが個別編集した本文、振り返り用)・`story_blessings`
 * (章内の雑魚戦・ボス戦への挑戦回数、マスコットキャラクターの「祝福」用)を扱う。
 */

/**
 * `story_chapters` 1行を組み立てる。
 * `playedAt` は該当ユーザーの `story_plays.created_at`(未プレイなら`null`)。
 * `locked` は前章クリア判定の結果(呼び出し元が `compute_locked_map` で
 * 計算済みの値をそのまま渡す。デフォルトの`false`は後方互換のためのフォールバックで、
 * 実際の呼び出し元は必ず明示的に渡す)。
 */
function assemble_chapter(array $row, ?string $playedAt = null, bool $locked = false): array
{
    return [
        'id' => (int) $row['id'],
        'chapterNumber' => (int) $row['chapter_number'],
        'title' => $row['title'],
        'outline' => $row['outline'],
        'publishedAt' => $row['published_at'],
        'playedAt' => $playedAt,
        'mascotCharacterId' => $row['mascot_character_id'] !== null ? (int) $row['mascot_character_id'] : null,
        'mobDeckId' => $row['mob_deck_id'] !== null ? (int) $row['mob_deck_id'] : null,
        'bossDeckId' => $row['boss_deck_id'] !== null ? (int) $row['boss_deck_id'] : null,
        'locked' => $locked,
    ];
}

function assemble_play(array $row): array
{
    return [
        'chapterId' => (int) $row['story_chapter_id'],
        'content' => $row['content'],
        'createdAt' => $row['created_at'],
        'clearedAt' => $row['cleared_at'] ?? null,
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
 * 公開済み章(`chapter_number` 昇順で渡されること前提)それぞれについて、
 * 指定ユーザーから見たロック状態を計算する。先頭の章は常に解放、2章目以降は
 * 「直前の章をクリア済み(`story_plays.cleared_at` が非NULL)」かどうかで判定する
 * (`chapter_number` 昇順を「進行順」として扱う。ボス戦が無い章は
 * `save-play` 側で即座に `cleared_at` をセットするため、従来通り
 * 「プレイ済み=クリア済み=次章解放」という挙動になる)。
 * `userId` が `null`(未ログイン)の場合はすべて `true`(未解放)を返す。
 *
 * 戻り値は `story_chapters.id => bool(locked)` のマップ。
 */
function compute_locked_map(PDO $pdo, array $chapterRows, ?int $userId): array
{
    $locked = [];
    if ($userId === null) {
        foreach ($chapterRows as $row) {
            $locked[(int) $row['id']] = true;
        }
        return $locked;
    }

    $clearedChapterIds = [];
    $stmt = $pdo->prepare(
        'SELECT story_chapter_id FROM story_plays WHERE user_id = ? AND cleared_at IS NOT NULL'
    );
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll() as $row) {
        $clearedChapterIds[(int) $row['story_chapter_id']] = true;
    }

    $previousCleared = true;
    foreach ($chapterRows as $row) {
        $id = (int) $row['id'];
        $locked[$id] = !$previousCleared;
        $previousCleared = isset($clearedChapterIds[$id]);
    }
    return $locked;
}
