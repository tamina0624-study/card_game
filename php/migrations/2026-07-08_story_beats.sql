-- 章内に複数の「ストーリー」「戦闘イベント」を任意の順序で登録できるようにする再設計。
-- `php/schema.sql`・`php/migrate.php`に加えた変更と同内容を、`migrate.php`(ADMIN_KEY保護の
-- HTTPエンドポイント)を経由せず直接実行できるよう、1本のSQLスクリプトにまとめたもの。
--
-- 前提: この時点で本番にはまだ章データ(story_chapters)が1件も登録されていないため、
-- 既存データの移行は行わずそのままDROP/ALTERしてよい(`story_chapters.mob_deck_id`/
-- `boss_deck_id`・`battles.story_chapter_id`/`story_phase`・`story_plays`はすべて空)。
-- 既にデータが入っている環境で実行する場合は、実行前に該当テーブルの内容を確認すること。
--
-- 実行後、`php/migrate.php`(ADMIN_KEY)を叩いても同じ最終状態になるよう
-- 冪等な分岐を入れてあるため、二重実行しても安全(このスクリプト自体は1回実行する想定)。

-- 1. 章内のビート(ストーリー/戦闘イベント)テーブルを新設する。
CREATE TABLE IF NOT EXISTS story_beats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  story_chapter_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  beat_type ENUM('story', 'battle') NOT NULL,
  title VARCHAR(255) NOT NULL,
  outline TEXT,
  deck_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_story_beats_chapter_id (story_chapter_id),
  KEY idx_story_beats_deck_id (deck_id),
  CONSTRAINT fk_story_beats_chapter
    FOREIGN KEY (story_chapter_id) REFERENCES story_chapters(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_beats_deck
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. ユーザーごとのビート進捗テーブルを新設する(`story_plays`を置き換える)。
CREATE TABLE IF NOT EXISTS story_beat_progress (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  story_beat_id INT NOT NULL,
  content LONGTEXT,
  raw_ai_response LONGTEXT,
  cleared_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_story_beat_progress_user_beat (user_id, story_beat_id),
  KEY idx_story_beat_progress_user_id (user_id),
  CONSTRAINT fk_story_beat_progress_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_beat_progress_beat
    FOREIGN KEY (story_beat_id) REFERENCES story_beats(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. `story_chapters.mob_deck_id`/`boss_deck_id`(章につき雑魚戦1つ・ボス戦1つ限定だった
--    旧仕様)を廃止する。対戦相手デッキは `story_beats.deck_id`(章内の戦闘ビートごと)に一本化。
ALTER TABLE story_chapters
  DROP FOREIGN KEY fk_story_chapters_mob_deck,
  DROP FOREIGN KEY fk_story_chapters_boss_deck,
  DROP KEY idx_story_chapters_mob_deck_id,
  DROP KEY idx_story_chapters_boss_deck_id,
  DROP COLUMN mob_deck_id,
  DROP COLUMN boss_deck_id;

-- 4. `battles.story_chapter_id`/`story_phase`(章単位・雑魚/ボスの2値限定だった紐付け)を
--    廃止し、`story_beat_id`(章内のどの戦闘ビートとして実行したか)一本に統一する。
ALTER TABLE battles
  DROP FOREIGN KEY fk_battles_story_chapter,
  DROP KEY idx_battles_story_chapter_id,
  DROP COLUMN story_chapter_id,
  DROP COLUMN story_phase,
  ADD COLUMN story_beat_id INT NULL AFTER deck_b_id,
  ADD KEY idx_battles_story_beat_id (story_beat_id),
  ADD CONSTRAINT fk_battles_story_beat
    FOREIGN KEY (story_beat_id) REFERENCES story_beats(id) ON DELETE SET NULL;

-- 5. `story_plays`(章単位でのAI個別化本文・クリア判定)を廃止する。
DROP TABLE IF EXISTS story_plays;
