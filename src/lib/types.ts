/**
 * 共有 TypeScript 型定義。
 *
 * 複数のドメイン層(lib/characters, lib/decks, lib/battles など)や
 * API Route Handlers、フロントエンドから参照する型をここに集約する。
 *
 * タスク4(キャラクターDTO/バリデーション実装)でキャラクター関連の型、
 * タスク7(デッキDTO/バリデーション + デッキCRUD API実装)でデッキ関連の型を
 * 定義した。バトル関連の型は該当タスク(9〜11)で追記する想定。
 */

// --- キャラクター --------------------------------------------------------

/**
 * キャラクターのパラメーター1件(登録・更新リクエストの入力用)。
 * パラメーター名・値ともに完全自由入力(開発指示書「パラメーター名は完全自由とする」)。
 */
export type CharacterParameterInput = {
  name: string;
  value: number;
};

/**
 * キャラクターの必殺技1件(登録・更新リクエストの入力用)。
 * 技名以外(説明・演出テキスト)は任意入力。
 */
export type SpecialMoveInput = {
  name: string;
  description?: string;
  flavorText?: string;
};

/**
 * キャラクター登録・更新リクエストのボディ形状。
 * `POST /api/characters` / `PUT /api/characters/:id` のリクエストボディに対応する
 * (docs/設計.md 3章参照)。
 */
export type CharacterInput = {
  name: string;
  description?: string;
  imageUrl?: string;
  parameters: CharacterParameterInput[];
  specialMoves?: SpecialMoveInput[];
};

/** DBに保存済みのキャラクターパラメーター(id・並び順付き)。 */
export type CharacterParameter = {
  id: number;
  name: string;
  value: number;
  sortOrder: number;
};

/** DBに保存済みの必殺技(id・並び順付き)。 */
export type SpecialMove = {
  id: number;
  name: string;
  description: string | null;
  flavorText: string | null;
  sortOrder: number;
};

/**
 * キャラクター(取得系API・リポジトリ層の戻り値の形状)。
 * `parameters` の合計値は `totalPoints` にキャッシュされる
 * (`characters.total_points`、登録・更新時にアプリ側で再計算する)。
 */
export type Character = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  totalPoints: number;
  parameters: CharacterParameter[];
  specialMoves: SpecialMove[];
  createdAt: string;
  updatedAt: string;
};

/**
 * キャラクター一覧APIのレスポンスDTO(サマリ情報のみ)。
 * `GET /api/characters` は `parameters`/`specialMoves` の全件ではなく、
 * 件数(`parameterCount`/`specialMoveCount`)のみを含むこの形状の配列を返す
 * (docs/設計.md 3章「パラメータ合計・必殺技数を含む簡易情報」)。
 */
export type CharacterSummary = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  totalPoints: number;
  parameterCount: number;
  specialMoveCount: number;
  createdAt: string;
  updatedAt: string;
};

// --- デッキ --------------------------------------------------------------

/**
 * デッキ1枚分のカード指定(登録・更新リクエストの入力用)。
 * `role` は前衛('front')/控え('bench')の区分(docs/設計.md 0章-2)。
 */
export type DeckCardInput = {
  characterId: number;
  role: "front" | "bench";
};

/**
 * デッキ登録・更新リクエストのボディ形状。
 * `POST /api/decks` / `PUT /api/decks/:id` のリクエストボディに対応する
 * (docs/設計.md 3章参照)。`cards` はちょうど8件、front4件/bench4件であることを
 * `lib/decks/validation.ts` で検証する。
 */
export type DeckInput = {
  name: string;
  ownerName?: string;
  cards: DeckCardInput[];
};

/**
 * デッキ一覧APIのレスポンスDTO(概要情報のみ)。
 * `GET /api/decks` は `front`/`bench` の詳細を含まないこの形状の配列を返す。
 */
export type DeckSummary = {
  id: number;
  name: string;
  ownerName: string | null;
  createdAt: string;
};

/**
 * デッキ詳細(取得系API・リポジトリ層の戻り値の形状)。
 * `front`/`bench` はそれぞれちょうど4件、`deck_cards.slot_order` の順に並んだ
 * キャラクター全情報(パラメーター・必殺技を含む)を保持する。
 */
export type Deck = {
  id: number;
  name: string;
  ownerName: string | null;
  front: Character[];
  bench: Character[];
  createdAt: string;
  updatedAt: string;
};

// --- バトル --------------------------------------------------------------

/** バトルの進行状況(`battles.status`)。 */
export type BattleStatus = "pending" | "running" | "completed" | "failed";

/**
 * バトル実行リクエストのボディ形状。
 * `POST /api/battles` のリクエストボディに対応する(docs/設計.md 3章参照)。
 */
export type BattleInput = {
  deckAId: number;
  deckBId: number;
};

/** AIによる戦況分析・事前予想勝者。バトル完了前は `null`。 */
export type BattleAnalysis = {
  teamA: string;
  teamB: string;
  predictedWinner: "teamA" | "teamB";
};

/** 戦闘ログ1行分(ターン番号・実況テキスト)。 */
export type BattleLogEntry = {
  turn: number;
  message: string;
};

/**
 * 戦闘演出イベント1件分。`type`/`character`/`effect`は代表的なフィールドを
 * 型付きで取り出したもので、`raw` にイベントオブジェクト全体(`effectType`/
 * `camera`/`message` 等の自由記述フィールドを含む)を保持する
 * (docs/設計.md 0章-5「JSON出力スキーマは自由記述を許容し、DB側は生JSONも保持する」)。
 */
export type BattleEventDetail = {
  turn: number | null;
  type: string | null;
  character: string | null;
  effect: string | null;
  raw: Record<string, unknown>;
};

/** バトル結果(勝者・MVP)。バトル完了前は `null`。 */
export type BattleResult = {
  winner: "teamA" | "teamB";
  mvpName: string;
  mvpCharacterId: number | null;
};

/** バトル一覧APIのレスポンスDTO(概要情報のみ)。 */
export type BattleSummary = {
  id: number;
  status: BattleStatus;
  deckA: { id: number; name: string };
  deckB: { id: number; name: string };
  winner: "teamA" | "teamB" | null;
  mvpName: string | null;
  createdAt: string;
  completedAt: string | null;
};

/**
 * バトル詳細(取得系API・リポジトリ層の戻り値の形状、docs/設計.md 3章
 * `BattleDetail` の形状イメージにそのまま対応)。
 */
export type BattleDetail = {
  id: number;
  status: BattleStatus;
  deckA: { id: number; name: string };
  deckB: { id: number; name: string };
  analysis: BattleAnalysis | null;
  battleLog: BattleLogEntry[];
  events: BattleEventDetail[];
  result: BattleResult | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

// --- ユーザー(追加機能20260707.md「ユーザー登録機能」) --------------------

/** ログイン中のユーザー(パスワードは含まない、`GET /api/auth/me` 等の戻り値)。 */
export type User = {
  id: number;
  username: string;
  createdAt: string;
};

/**
 * ユーザー登録直後のみ返る形状。`password` はアプリが自動生成した平文パスワードで、
 * この応答でのみユーザーに提示される(以後は忘れた場合の問い合わせ
 * `POST /api/auth/recover` で再確認する)。
 */
export type RegisteredUser = {
  user: User;
  password: string;
};

// --- ストーリー(追加機能20260707.md「ストーリー機能」) ---------------------

/**
 * ストーリー章の一覧・詳細表示用DTO。`outline` は開発者が投入する固定の大枠(あらすじ)、
 * `playedAt` はログイン中ユーザーがこの章をプレイ済みの場合のみ日時が入る
 * (未ログイン・未プレイの場合は `null`)。
 */
export type StoryChapterSummary = {
  id: number;
  chapterNumber: number;
  title: string;
  outline: string;
  publishedAt: string;
  playedAt: string | null;
};

/** ユーザーがAIに個別編集させた、その章の物語本文(一度生成されたら以後は同じ内容)。 */
export type StoryPlay = {
  chapterId: number;
  content: string;
  createdAt: string;
};

/** ストーリー章詳細(`play` はログイン中ユーザーがまだプレイしていない場合 `null`)。 */
export type StoryChapterDetail = StoryChapterSummary & {
  play: StoryPlay | null;
};

/** 振り返り一覧(`GET /api/stories/history`)1件分。 */
export type StoryHistoryEntry = StoryPlay & {
  chapterNumber: number;
  chapterTitle: string;
};
