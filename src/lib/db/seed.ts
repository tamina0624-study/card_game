/**
 * 開発・確認用サンプルデータ投入スクリプト(`npm run db:seed`)。
 *
 * サンプルキャラクター・サンプルデッキのデータ本体はPHPブリッジ側
 * (`php/seed-data.json`、このファイルが元々持っていたデータをそのまま移設したもの)に
 * 置かれており、DB本体はもうこのプロセスから直接触れない(MySQLはPHPブリッジ経由のみ)
 * ため、このスクリプトはPHPブリッジの保護エンドポイント `seed.php`
 * (`PHP_BRIDGE_ADMIN_KEY` で保護)を1回呼び出すだけの薄いスクリプトになっている。
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

  const response = await fetch(`${bridgeUrl}/seed.php`, {
    headers: { "X-API-Key": adminKey },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`seed.php の呼び出しに失敗しました(status=${response.status}): ${body}`);
  }

  console.log(`[db:seed] ${body}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {};
