/**
 * バトルプロンプト生成ロジック。
 *
 * `POST /api/battles`(タスク11)で実際にClaudeへ送るユーザーメッセージ本文を
 * 組み立てる。`lib/decks/repository.ts` の `getDeckById` が返す `Deck` 型
 * (front/bench各4体、キャラクターのパラメータ・必殺技を含む全情報)を
 * そのまま入力として受け取り、Claudeへの単一の文字列メッセージへ整形する
 * (docs/設計.md 1.4「Claude API呼び出し方針」参照)。
 *
 * このモジュールが構築するメッセージには以下を含める:
 * - チームA/チームBそれぞれの前衛4体・控え4体の「名前・説明・パラメータ
 *   (名前:値の列挙)・必殺技(技名/説明/演出テキストの列挙)」
 * - 戦闘フェーズ(戦闘前分析→戦闘開始→通常行動→必殺技発動→戦闘不能判定→
 *   控え補充→勝敗決定→MVP発表)の遂行指示
 * - 確定事項(開発指示書.md「確定事項」節、2026-07-03付)の明記:
 *   1. 行動順は完全ランダムであること
 *   2. 100ポイント制約はアプリ側で登録時に検証済みであり、AIは検証不要であること
 *   3. 必殺技の発動有無および使用技の選択はランダムであること
 *   4. 前衛が戦闘不能になった場合は控えから自動的にランダムで補充されること
 *   5. 勝敗はストーリー補正なく合理的に決定し、理由を説明可能にすること
 *   6. 前衛が戦闘不能になった際は、そのメッセージ内に必ずキャラクター名+
 *      「戦闘不能になった」という文言をそのまま含めること(フロントエンドの
 *      `BattleLogViewer`(`findDefeatedName`)がこの定型文言を手がかりに
 *      戦闘エリアのカードをグレイアウトする演出を出すため、「倒した」「沈黙」等の
 *      言い換えに置き換えない)
 *   7. 必殺技発動時は、そのメッセージ内に必ずキャラクター名+「必殺技」+
 *      『技名』をそのまま含めること(`findSpecialMoveName`/`extractMoveName`が
 *      これを手がかりに戦闘エリアでキャラクターカードのカットイン演出を出す)
 * - 開発指示書.md「AI出力形式」のJSONスキーマ(analysis/battleLog/events/result)を
 *   そのまま提示し、JSON形式のみを出力するよう明示的に指示する
 *
 * 100ポイント制約・8枚/前衛4/控え4制約はいずれも登録時(`lib/characters/validation.ts`
 * および `lib/decks/validation.ts`)で検証済みのデータのみがここに渡ってくる前提であり、
 * このモジュール自身は一切の検証を行わない(検証はAI側にも委ねない)。
 */

import type { Character, Deck } from "@/lib/types";

/**
 * `buildBattlePrompt` が受け取るデッキの型。
 * `lib/decks/repository.ts` の `getDeckById` の戻り値(front/bench各4体の
 * キャラクター全情報を含む「デッキ詳細」)がそのまま該当する。
 */
export type DeckDetail = Deck;

/** キャラクター1体分のパラメータを「名前:値」の列挙として整形する。 */
function formatParameters(character: Character): string {
  if (character.parameters.length === 0) {
    return "(パラメータ未設定)";
  }
  return character.parameters
    .map((parameter) => `${parameter.name}:${parameter.value}`)
    .join("、");
}

/** キャラクター1体分の必殺技を「技名/説明/演出テキスト」の列挙として整形する。 */
function formatSpecialMoves(character: Character): string {
  if (character.specialMoves.length === 0) {
    return "    (必殺技なし)";
  }
  return character.specialMoves
    .map((move, index) => {
      const description = move.description?.trim() || "(説明未設定)";
      const flavorText = move.flavorText?.trim() || "(演出テキスト未設定)";
      return `    ${index + 1}. 技名:${move.name} / 説明:${description} / 演出テキスト:${flavorText}`;
    })
    .join("\n");
}

/** キャラクター1体分を「名前・説明・パラメータ・必殺技」の形式で整形する。 */
function formatCharacter(character: Character, index: number): string {
  const description = character.description?.trim() || "(説明未設定)";
  return [
    `  ${index + 1}. 名前:${character.name}`,
    `     説明:${description}`,
    `     パラメータ:${formatParameters(character)}`,
    `     必殺技:`,
    formatSpecialMoves(character),
  ].join("\n");
}

/** デッキ1件分を「前衛4体・控え4体」の形式で整形する(チームA/チームBの各セクション本体)。 */
function formatDeckSection(deck: DeckDetail, teamLabel: string): string {
  const frontSection = deck.front.map((character, index) => formatCharacter(character, index)).join("\n");
  const benchSection = deck.bench.map((character, index) => formatCharacter(character, index)).join("\n");

  return [
    `【${teamLabel}】デッキ名:${deck.name}`,
    ` 前衛(4体・戦闘開始時に行動する):`,
    frontSection,
    ` 控え(4体・前衛が戦闘不能になった際に補充される):`,
    benchSection,
  ].join("\n");
}

/**
 * 2つのデッキ(チームA/チームB)の情報から、Claudeへ送るユーザーメッセージ本文を
 * 単一の文字列として構築する。
 *
 * この文字列はそのまま `callBattleJudge`(`lib/claude/client.ts`)の
 * `userMessage` 引数として使用できる形になっている。
 */
export function buildBattlePrompt(deckA: DeckDetail, deckB: DeckDetail): string {
  const sections: string[] = [];

  sections.push(
    "これから2つのチームによるバトルを実況・審判してもらいます。以下の情報をもとに戦闘を進行してください。"
  );

  sections.push("---\n" + formatDeckSection(deckA, "チームA"));
  sections.push("---\n" + formatDeckSection(deckB, "チームB"));

  sections.push(
    [
      "---",
      "【戦闘フェーズ】",
      "以下の順序で戦闘を進行すること。",
      "1. 戦闘前分析",
      "2. 戦闘開始",
      "3. 通常行動",
      "4. 必殺技発動",
      "5. 戦闘不能判定",
      "6. 控え補充",
      "7. 勝敗決定",
      "8. MVP発表",
    ].join("\n")
  );

  sections.push(
    [
      "---",
      "【必ず守るべき確定事項】",
      "1. 行動順は完全ランダムである。各チームの前衛4体は素早さ等の概念を持たず、行動順は完全にランダムに決定すること。",
      "2. 100ポイント制約はアプリ側でキャラクター登録時に検証済みである。AI側でパラメータ合計値を検証する必要は一切ない。",
      "3. 必殺技の発動有無、および発動する場合にどの必殺技を使用するかは、いずれもランダムに決定すること(クールダウンやゲージの概念は存在しない)。",
      "4. 前衛が戦闘不能になった場合、控えの中からランダムに1体を選出し自動的に前衛へ補充すること。",
      "5. 勝敗はストーリー都合や主人公補正で変えず、パラメータ値・パラメータ名の意味・必殺技の説明・キャラクター説明・チーム構成をもとに合理的に決定し、その理由を説明可能にすること。特定の能力を万能扱いにせず、どんな能力にも弱点があるものとして扱うこと。",
      "6. キャラクターが戦闘不能になった場合、そのターンのbattleLogメッセージ内に必ずそのキャラクターの名前と「戦闘不能になった」という文言をそのまま含めること(例:「〇〇が戦闘不能になった」)。「倒した」「沈黙した」「力尽きた」等の言い換え表現は使わないこと。複数体が同時に戦闘不能になる場合も、対象者ごとに名前+「戦闘不能になった」を明記すること。",
      "7. 必殺技が発動した場合、そのターンのbattleLogメッセージ内に必ず発動したキャラクターの名前の直後に「必殺技」という文言と、技名を『』で囲んだ形をそのまま含めること(例:「〇〇が必殺技『技名』を発動した」)。「奥義」「秘技」等の言い換えは使わず、必ず「必殺技」という語を使うこと。",
    ].join("\n")
  );

  sections.push(
    [
      "---",
      "【出力形式】",
      "以下のJSON形式のみを出力し、Markdownのコードブロックや説明文などは一切含めないこと。",
      "",
      "{",
      '"analysis": {',
      '"teamA": "...",',
      '"teamB": "...",',
      '"predictedWinner": "teamA"',
      "},",
      '"battleLog": [',
      "{",
      '"turn": 1,',
      '"message": "..."',
      "}",
      "],",
      '"events": [',
      "{",
      '"type": "special_move",',
      '"character": "...",',
      '"effect": "fire"',
      "}",
      "],",
      '"result": {',
      '"winner": "teamA",',
      '"mvp": "..."',
      "}",
      "}",
    ].join("\n")
  );

  return sections.join("\n\n");
}
