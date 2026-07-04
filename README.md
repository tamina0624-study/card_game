# card_game — AIキャラクターカードバトルゲーム

ユーザーが自由にキャラクターカードを作成し、AI(Claude)が公平な審判として戦闘ログを生成するオンラインカードゲームのMVP実装。

仕様の詳細は以下を参照。

- [開発指示書.md](./開発指示書.md) — ゲーム仕様全体・確定事項
- [システムプロンプト.md](./システムプロンプト.md) — AI審判用システムプロンプト
- [docs/設計.md](./docs/設計.md) — アーキテクチャ・DBスキーマ・APIルート設計
- [進捗.md](./進捗.md) — 実装タスクの進捗・検証記録

## 技術スタック

- Next.js (TypeScript, App Router) — フロントエンド+API(Route Handlers)
- SQLite(`better-sqlite3`) — データ永続化
- Claude API(`@anthropic-ai/sdk`) — AI戦闘審判

## 必要環境

- Node.js 20以上
- npm

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` を編集し、`ANTHROPIC_API_KEY` に有効なAnthropic APIキーを設定する。

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude APIキー |
| `ANTHROPIC_MODEL` | No | `claude-opus-4-8` | AI審判に使用するモデルID |
| `DB_PATH` | No | `./data/game.db` | SQLiteファイルの保存先 |
| `OPENROUTER_API_KEY` | No | — | 設定した場合、AI審判はOpenRouter経由(`OPENROUTER_MODEL`)で呼び出される(`ANTHROPIC_API_KEY`より優先)。Anthropicの有料キーが用意できない開発時の代替経路 |
| `OPENROUTER_MODEL` | No | `nvidia/nemotron-3-nano-30b-a3b:free` | OpenRouter使用時のモデルID |

DBを初期化し、サンプルデータ(キャラクター16体・サンプルデッキ2件)を投入する。

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

- 画像アップロードはローカル保存(`public/uploads/characters/`)、2MB上限。
- 認証機能はなし(キャラクター/デッキは共有プール)。
- 大量データ時のパフォーマンス最適化は未実施。
- 詳細は [進捗.md](./進捗.md) の「最終確認」節を参照。
