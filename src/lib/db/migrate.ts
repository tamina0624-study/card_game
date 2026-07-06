/**
 * DBスキーマ初期化スクリプト(`npm run db:migrate`)。
 *
 * DB本体はもうこのプロセスから直接触れない(MySQLはPHPブリッジ経由のみ)ため、
 * PHPブリッジの保護エンドポイント `migrate.php`(`PHP_BRIDGE_ADMIN_KEY` で保護)を
 * 1回呼び出すだけの薄いスクリプトになっている。`php/schema.sql` は
 * `CREATE TABLE IF NOT EXISTS` のみで構成されているため、何度実行しても安全(冪等)。
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

async function main() {
  const bridgeUrl = requireEnv("PHP_BRIDGE_URL").replace(/\/$/, "");
  const adminKey = requireEnv("PHP_BRIDGE_ADMIN_KEY");

  const response = await fetch(`${bridgeUrl}/migrate.php`, {
    headers: { "X-API-Key": adminKey },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`migrate.php の呼び出しに失敗しました(status=${response.status}): ${body}`);
  }

  console.log(`[db:migrate] ${body}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {};
