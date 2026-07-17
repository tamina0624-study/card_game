# card_game — AIキャラクターカードバトルゲーム

ユーザーが自由にキャラクターカードを作成し、AI(Claude)が公平な審判として戦闘ログを生成するオンラインカードゲームのMVP実装。

仕様の詳細は以下を参照。

- [docs/開発指示書.md](./docs/開発指示書.md) — ゲーム仕様全体・確定事項
- [docs/システムプロンプト.md](./docs/システムプロンプト.md) — AI審判用システムプロンプト
- [docs/設計.md](./docs/設計.md) — アーキテクチャ・DBスキーマ・APIルート設計
- [docs/進捗.md](./docs/進捗.md) — 実装タスクの進捗・検証記録
- [docs/画面構成・UI部品名.md](./docs/画面構成・UI部品名.md) — 画面・領域・UI部品の命名リファレンス

## 技術スタック

- Next.js (TypeScript, App Router) — フロントエンド+API(Route Handlers)
- MySQL — データ永続化。Next.jsからは直接接続せず、スターサーバー
  (`public_html/card_game/php`)に配置したPHPブリッジ(`php/`)にHTTP経由でアクセスする
  (`src/lib/bridge/client.ts`参照。共有ホスティングでは外部からのMySQL直接接続が
  許可されないことが多いため)。
- Claude API(`@anthropic-ai/sdk`) — AI戦闘審判

## 必要環境

- Node.js 20以上
- npm
- PHP 8.1以上 + MySQL 8.0以上(`php/`配下をスターサーバー等のホスティングへ配置する側)

## セットアップ

```bash
npm install
cp .env.example .env.local
cp php/config.example.php php/config.php
```

`.env.local` を編集し、`ANTHROPIC_API_KEY` に有効なAnthropic APIキーを、
`PHP_BRIDGE_URL`/`PHP_BRIDGE_API_KEY`/`PHP_BRIDGE_ADMIN_KEY` に配置先PHPブリッジの
接続情報を設定する(`php/config.php` の `API_KEY`/`ADMIN_KEY` と一致させること)。

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude APIキー |
| `ANTHROPIC_MODEL` | No | `claude-opus-4-8` | AI審判に使用するモデルID |
| `OPENROUTER_API_KEY` | No | — | 設定した場合、AI審判はOpenRouter経由(`OPENROUTER_MODEL`)で呼び出される(`ANTHROPIC_API_KEY`より優先)。Anthropicの有料キーが用意できない開発時の代替経路 |
| `OPENROUTER_MODEL` | No | `nvidia/nemotron-3-nano-30b-a3b:free` | OpenRouter使用時のモデルID |
| `PHP_BRIDGE_URL` | Yes | — | PHPブリッジのベースURL(例: `http://ss181301.stars.ne.jp/card_game/php`) |
| `PHP_BRIDGE_API_KEY` | Yes | — | 通常のCRUD用共有シークレット(`php/config.php`の`API_KEY`と一致させる) |
| `PHP_BRIDGE_ADMIN_KEY` | Yes | — | `db:migrate`/`db:seed`(破壊的操作)専用シークレット(`php/config.php`の`ADMIN_KEY`と一致させる) |
| `NEXT_PUBLIC_ASSET_BASE_URL` | No | `http://ss181301.stars.ne.jp/card_game/public` | 背景・サンプル画像・BGM・アップロード画像の配信元ベースURL |

PHPブリッジ(`php/`配下)をMySQLが使えるホストに配置したうえで、DBを初期化し
サンプルデータ(キャラクター23体・サンプルデッキ2件)を投入する。

```bash
npm run db:migrate
npm run db:seed
```

## 起動方法

開発サーバーを起動する。

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く。

- `/characters` — キャラクター一覧・作成(`/characters/new`)
- `/decks` — デッキ一覧・編成(`/decks/new`、8枚・前衛4/控え4を選択)
- `/battles` — 対戦実行(2つのデッキを選んで対戦開始)・対戦履歴・結果閲覧(`/battles/[id]`)

本番ビルドで起動する場合は以下を使う。

```bash
npm run build
npm run start
```

## 開発コマンド

```bash
npm run lint         # ESLint
npm run build        # 型チェック込みの本番ビルド
npm run db:migrate   # スキーマ適用(冪等)
npm run db:seed      # サンプルデータ投入(既存データは削除して再投入)
```

## 既知の制約(MVP時点)

- 画像アップロードはPHPブリッジ経由でスターサーバー側に保存(`public_html/card_game/public/uploads/characters/`)、2MB上限。
- 認証機能はなし(キャラクター/デッキは共有プール)。
- 大量データ時のパフォーマンス最適化は未実施。
- 詳細は [docs/進捗.md](./docs/進捗.md) の「最終確認」節を参照。
