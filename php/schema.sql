-- MySQL DDL (src/lib/db/schema.sql のSQLite版から移植)。
-- `CREATE TABLE IF NOT EXISTS` + テーブル内 `KEY` 定義のみで完結させ、
-- MySQLが非対応の `CREATE INDEX IF NOT EXISTS` を使わずに冪等実行できるようにする。
-- `migrate.php` がこのファイルをセミコロン区切りで分割実行する。

CREATE TABLE IF NOT EXISTS characters (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  image_url TEXT,
  description TEXT,
  total_points INT NOT NULL DEFAULT 0,
  -- システム(運営)側が登録した固定キャラクターかどうか。trueの場合、
  -- characters.php はPUT/DELETEを403で拒否し、編集画面でパラメーターを
  -- 強化・削除できないようにする(migrate.phpの追記ALTER文も参照)。
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS character_parameters (
  id INT PRIMARY KEY AUTO_INCREMENT,
  character_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  value INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_character_parameters_character_id (character_id),
  CONSTRAINT fk_character_parameters_character
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS special_moves (
  id INT PRIMARY KEY AUTO_INCREMENT,
  character_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  flavor_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_special_moves_character_id (character_id),
  CONSTRAINT fk_special_moves_character
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS decks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deck_cards (
  id INT PRIMARY KEY AUTO_INCREMENT,
  deck_id INT NOT NULL,
  character_id INT NOT NULL,
  role ENUM('front', 'bench') NOT NULL,
  slot_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_deck_cards_deck_character (deck_id, character_id),
  KEY idx_deck_cards_deck_id (deck_id),
  CONSTRAINT fk_deck_cards_deck
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  CONSTRAINT fk_deck_cards_character
    FOREIGN KEY (character_id) REFERENCES characters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS battles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  deck_a_id INT NOT NULL,
  deck_b_id INT NOT NULL,
  status ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  winner ENUM('teamA', 'teamB'),
  mvp_character_id INT,
  mvp_name VARCHAR(255),
  analysis_team_a TEXT,
  analysis_team_b TEXT,
  predicted_winner ENUM('teamA', 'teamB'),
  raw_ai_response LONGTEXT,
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  KEY idx_battles_deck_a_id (deck_a_id),
  KEY idx_battles_deck_b_id (deck_b_id),
  CONSTRAINT fk_battles_deck_a FOREIGN KEY (deck_a_id) REFERENCES decks(id),
  CONSTRAINT fk_battles_deck_b FOREIGN KEY (deck_b_id) REFERENCES decks(id),
  CONSTRAINT fk_battles_mvp_character FOREIGN KEY (mvp_character_id) REFERENCES characters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS battle_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  battle_id INT NOT NULL,
  turn INT NOT NULL,
  message TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_battle_logs_battle_id (battle_id),
  CONSTRAINT fk_battle_logs_battle
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS battle_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  battle_id INT NOT NULL,
  turn INT,
  event_type VARCHAR(255),
  character_name VARCHAR(255),
  effect VARCHAR(255),
  raw_json LONGTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_battle_events_battle_id (battle_id),
  CONSTRAINT fk_battle_events_battle
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ユーザー(追加機能20260707.md「ユーザー登録機能」)。
-- パスワードはアプリがランダムに生成した10文字英数字であり、ユーザー自身が選んだ
-- 秘密情報ではないため、問い合わせ対応(本人からの再照会)に答えられるよう平文で保持する
-- (このアプリの意図的な設計判断。ユーザーが使い回している可能性のある秘密のパスワードを
-- 保存するわけではない)。
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ログインセッション。Next.js側はセッショントークンをhttpOnly Cookieとして保持し、
-- リクエスト毎にこのテーブルを引いてユーザーを解決する(トークン自体はランダムな
-- 64文字の16進文字列で推測不可能、有効期限はログイン時に30日で設定する)。
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY uniq_user_sessions_token (token),
  KEY idx_user_sessions_user_id (user_id),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ストーリーの大枠(追加機能20260707.md「ストーリー機能」)。毎週追加される、
-- 全ユーザー共通の固定シナリオ本体。管理者(開発者)が `stories.php`
-- (action=create-chapter、ADMIN_KEY保護)経由で投入する。
CREATE TABLE IF NOT EXISTS story_chapters (
  id INT PRIMARY KEY AUTO_INCREMENT,
  chapter_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  outline TEXT NOT NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_story_chapters_chapter_number (chapter_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ユーザーごとにAIが個別編集したストーリー本文。ログインユーザーが章を初めて
-- プレイした時点で1件生成され、以後は同じ内容を再表示する(振り返り用の記録)。
CREATE TABLE IF NOT EXISTS story_plays (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  story_chapter_id INT NOT NULL,
  content LONGTEXT NOT NULL,
  raw_ai_response LONGTEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_story_plays_user_chapter (user_id, story_chapter_id),
  KEY idx_story_plays_user_id (user_id),
  CONSTRAINT fk_story_plays_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_plays_chapter
    FOREIGN KEY (story_chapter_id) REFERENCES story_chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 章内の雑魚戦・ボス戦(追加機能20260708.md「ストーリーモードに戦闘を組み込みたい」)を
-- 何回挑んだか(勝敗問わず)のユーザー別カウンター。マスコットキャラクターの「祝福」の
-- 度合いとして、挑戦回数が多いほどその章のバトル判定プロンプト内でのみパラメータに
-- 倍率をかける(`src/lib/stories/blessing.ts`)。`character_parameters`自体は書き換えない。
CREATE TABLE IF NOT EXISTS story_blessings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  story_chapter_id INT NOT NULL,
  battle_count INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_story_blessings_user_chapter (user_id, story_chapter_id),
  KEY idx_story_blessings_user_id (user_id),
  CONSTRAINT fk_story_blessings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_blessings_chapter
    FOREIGN KEY (story_chapter_id) REFERENCES story_chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 章内に登録する「ストーリー」「戦闘イベント」を任意の数・順序で並べるためのビート
-- (追加機能: 1章に複数のストーリー・戦闘イベントを登録できるようにする)。
-- `beat_type='story'` は `outline`(あらすじ、`lib/stories/generate.ts`がAI個別化する元ネタ)を、
-- `beat_type='battle'` は `deck_id`(対戦相手デッキ)を使う。管理者は
-- `stories.php` の `action=create-chapter`(章作成時にまとめて登録)・`action=add-beat`
-- (追加)・`action=update-beat`(deck_id等の後付け)で登録する。
CREATE TABLE IF NOT EXISTS story_beats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  story_chapter_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  beat_type ENUM('story', 'battle') NOT NULL,
  title VARCHAR(255) NOT NULL,
  outline TEXT,
  illustration_url TEXT,
  deck_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_story_beats_chapter_id (story_chapter_id),
  KEY idx_story_beats_deck_id (deck_id),
  CONSTRAINT fk_story_beats_chapter
    FOREIGN KEY (story_chapter_id) REFERENCES story_chapters(id) ON DELETE CASCADE,
  CONSTRAINT fk_story_beats_deck
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ユーザーごとのビート進捗(`story_plays`を置き換える、ビート単位版)。
-- `beat_type='story'`: `content`にAI個別化済み本文を保存し、生成と同時に`cleared_at`を確定する。
-- `beat_type='battle'`: `content`は常にNULLのまま、そのビートの戦闘に勝利した時点で
-- `cleared_at`を確定する(`stories.php`の`action=mark-beat-cleared`)。
-- 章内の次のビートは「直前のビートが`cleared_at`非NULLかどうか」で順送りにロック解除される。
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
