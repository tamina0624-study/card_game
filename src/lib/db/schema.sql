PRAGMA foreign_keys = ON;

-- キャラクター
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,     -- パラメータ合計値のキャッシュ(登録/更新時に再計算)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- キャラクターのパラメータ(名前・値ともに自由入力のため正規化テーブルとする)
CREATE TABLE IF NOT EXISTS character_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0 AND value <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_character_parameters_character_id
  ON character_parameters(character_id);

-- 必殺技(1キャラクターにつき複数保持可)
CREATE TABLE IF NOT EXISTS special_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- 技名
  description TEXT,             -- 説明
  flavor_text TEXT,              -- 演出テキスト
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_special_moves_character_id
  ON special_moves(character_id);

-- デッキ
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_name TEXT,               -- 自由入力の作成者名(認証なしのため任意)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- デッキとキャラクターの紐付け(前衛/控え区分を保持)
CREATE TABLE IF NOT EXISTS deck_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id),
  role TEXT NOT NULL CHECK (role IN ('front', 'bench')),
  slot_order INTEGER NOT NULL DEFAULT 0,   -- 表示順(前衛内/控え内の並び)
  UNIQUE(deck_id, character_id)
);
CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id);

-- 対戦
CREATE TABLE IF NOT EXISTS battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_a_id INTEGER NOT NULL REFERENCES decks(id),
  deck_b_id INTEGER NOT NULL REFERENCES decks(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  winner TEXT CHECK (winner IN ('teamA', 'teamB')),
  mvp_character_id INTEGER REFERENCES characters(id),  -- ベストエフォートで名前一致解決したID(見つからなければNULL)
  mvp_name TEXT,                                        -- AIが返した生のMVP名(自由記述)
  analysis_team_a TEXT,
  analysis_team_b TEXT,
  predicted_winner TEXT CHECK (predicted_winner IN ('teamA', 'teamB')),
  raw_ai_response TEXT,          -- 監査用: 採用したAI応答の生テキスト
  error_message TEXT,            -- status='failed'の場合の理由
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- 戦闘ログ(実況テキスト、ターン単位)
CREATE TABLE IF NOT EXISTS battle_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id INTEGER NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  message TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_battle_logs_battle_id ON battle_logs(battle_id);

-- 必殺技演出などのイベント(自由記述フィールドを保持するため raw_json を必須で保存)
CREATE TABLE IF NOT EXISTS battle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id INTEGER NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  turn INTEGER,                  -- AI出力に対応turnが無ければNULL
  event_type TEXT,                -- events[].type (自由記述)
  character_name TEXT,            -- events[].character (自由記述)
  effect TEXT,                    -- events[].effect (自由記述)
  raw_json TEXT NOT NULL,         -- イベントオブジェクト全体(effectType/camera/message等を保持)
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_battle_events_battle_id ON battle_events(battle_id);
