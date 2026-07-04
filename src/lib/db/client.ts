/**
 * better-sqlite3 の接続をプロセス内シングルトンとして提供する。
 *
 * - 接続先は環境変数 `DB_PATH`(未設定時は `./data/game.db`)。
 * - 親ディレクトリが存在しなければ作成する。
 * - 接続確立時に `PRAGMA foreign_keys = ON` を必ず実行する(外部キー制約を有効化)。
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

let dbInstance: Database.Database | undefined;

function resolveDbPath(): string {
  const dbPath = process.env.DB_PATH || "./data/game.db";
  return path.resolve(process.cwd(), dbPath);
}

function createConnection(): Database.Database {
  const resolvedPath = resolveDbPath();
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");
  return db;
}

/**
 * プロセス内で共有される better-sqlite3 の接続を返す。
 * 初回呼び出し時に接続を作成し、以降はキャッシュされたインスタンスを返す。
 */
export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = createConnection();
  }
  return dbInstance;
}
