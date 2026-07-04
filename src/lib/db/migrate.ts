/**
 * データベースマイグレーションスクリプト。
 *
 * `npm run db:migrate` から実行される。
 * schema.sql (DDL) を data/game.db に対して実行し、テーブルを作成する。
 * schema.sql は `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` のみで
 * 構成されているため、何度実行しても冪等に完了する。
 */

import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db/client";

function main() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  const db = getDb();
  db.exec(schemaSql);

  console.log(`[db:migrate] schema.sql を実行しました (${schemaPath})`);
}

main();

export {};
