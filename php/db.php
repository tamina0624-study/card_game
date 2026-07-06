<?php

/**
 * PDO接続のプロセス内シングルトン(better-sqlite3の getDb() と同じ方針)。
 *
 * 接続確立時に必ず `SET time_zone = '+00:00'` を実行する。SQLiteの `datetime('now')`
 * はUTCで保存されており、フロント側(`formatDateTime`系ヘルパー)は「保存値はUTC」を
 * 前提に `Z` を付与して解釈しているため、MySQL側のセッションタイムゾーンが
 * (日本のホストで想定される)JST等になっていても常にUTCで読み書きされるようにする。
 */

require_once __DIR__ . '/config.php';

function get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");

    return $pdo;
}
