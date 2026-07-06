<?php

/**
 * このファイルを config.php にコピーし、実際の接続情報・シークレットを設定する。
 * config.php はリポジトリに含めない(.gitignore対象)。
 */

// --- MySQL接続情報 ---------------------------------------------------------
define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', 'ss181301_cardgame');
define('DB_USER', '');
define('DB_PASS', '');

// --- 認証 -------------------------------------------------------------------
// Next.js側からの通常CRUDリクエストを認証する共有シークレット(X-API-Keyヘッダー)。
define('API_KEY', '');

// migrate.php / seed.php (全データ削除を伴う破壊的操作)専用の管理者シークレット。
// API_KEYと同じ値にしない(鍵漏洩時の被害範囲を分離するため)。
define('ADMIN_KEY', '');

// --- 静的アセット -------------------------------------------------------------
// アップロード画像・シードデータのimageUrlを組み立てる絶対URLのベース(末尾スラッシュなし)。
define('ASSET_BASE_URL', 'http://ss181301.stars.ne.jp/public_html/card_game/public');
