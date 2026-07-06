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
