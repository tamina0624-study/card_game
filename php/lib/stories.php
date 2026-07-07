<?php

/**
 * ストーリー機能の組み立てヘルパー(`stories.php` から共有)。
 * `story_chapters`(毎週追加される固定の大枠)と `story_plays`
 * (ユーザーごとにAIが個別編集した本文、振り返り用)を扱う。
 */

/** `story_chapters` 1行を組み立てる。`playedAt` は該当ユーザーの `story_plays.created_at`(未プレイなら`null`)。 */
function assemble_chapter(array $row, ?string $playedAt = null): array
{
    return [
        'id' => (int) $row['id'],
        'chapterNumber' => (int) $row['chapter_number'],
        'title' => $row['title'],
        'outline' => $row['outline'],
        'publishedAt' => $row['published_at'],
        'playedAt' => $playedAt,
    ];
}

function assemble_play(array $row): array
{
    return [
        'chapterId' => (int) $row['story_chapter_id'],
        'content' => $row['content'],
        'createdAt' => $row['created_at'],
    ];
}
