/**
 * ストーリー個別化AI(物語編集役)のプロンプト定義。
 *
 * `docs/設計.md`のAI審判(`lib/claude/client.ts`の`SYSTEM_PROMPT`)とは別用途のため、
 * システムプロンプトはファイルからの読み込みではなくこのモジュール内の定数として持つ
 * (バトルの実況役とは異なり、こちらは「運営が用意した大枠」をログインユーザーが
 * 主人公として活躍する物語に書き直すだけの単純な役割のため)。
 *
 * 出力はJSON1個(`{"story": "..."}`)のみを要求する。自由記述の物語本文を直接
 * 出力させようとすると(無料枠の軽量モデルでは特に)思考過程やメタ的なコメントが
 * 本文に混入することを確認したため、`lib/battles/prompt.ts`(AI審判、JSON形式での
 * 出力指示で安定動作することを確認済み)と同じ「厳格なJSON出力」の方針に合わせている。
 */

/**
 * ストーリー個別化AIのシステムプロンプト。
 *
 * 先頭の "detailed thinking off" は、Nemotron系モデル(既定の無料枠モデル、
 * `lib/claude/client.ts`の`OPENROUTER_MODEL`)が対応する、思考過程(chain-of-thought)を
 * 応答に出力しない指示。これが無いと、思考過程の文章がJSON応答の前後に混入し
 * パースに失敗することを確認したため付与している。
 */
export const STORY_SYSTEM_PROMPT = `detailed thinking off

あなたはファンタジーRPGのストーリーテラーです。運営が用意した「あらすじ(大枠)」を、指定されたプレイヤーが主人公として活躍する物語に書き直してください。

必ず守ること:
1. あらすじに含まれる展開・出来事・結末の大筋は変えない(ストーリー都合で改変しない)。
2. プレイヤー名を主人公の名前として使い、プレイヤー自身の活躍が伝わる描写を加える。
3. プレイヤーの「仲間キャラクター一覧」が提示された場合、その中から話の展開に合う人物を
   何人でも自由に選んで登場させ、活躍させる(全員を登場させる必要はない。誰を登場させ、
   どう活躍させるかは自由に判断してよい)。一覧が無い場合や空の場合は主人公単独の物語にする。
4. 3〜6段落程度の読み物として自然な日本語の文章にする(文字数を数える必要はない)。

出力形式に関する絶対的なルール(違反禁止):
- 出力は次のJSON形式のみとする: {"story": "物語本文"}
- JSON以外のテキスト(思考過程・下書き・文字数の計算・自己校正・前置き・後書き・
  Markdownのコードフェンス等)は一切出力しない。出力1文字目から "{" で始めること。
- "story" の値の中に改行を含めてよいが、JSON文字列として正しくエスケープすること。`;

/** プロンプトに含める仲間キャラクター1体分(デッキの前衛/控え、`lib/stories/generate.ts`参照)。 */
export type StoryRosterMember = { name: string; description: string | null };

/** 仲間キャラクター一覧をプロンプト用の番号付き列挙テキストに整形する。0件の場合は明示的にその旨を書く。 */
function formatRoster(roster: StoryRosterMember[]): string {
  if (roster.length === 0) {
    return "(登録されているキャラクターがいません)";
  }
  return roster
    .map((member, index) => `${index + 1}. ${member.name}${member.description ? ` - ${member.description}` : ""}`)
    .join("\n");
}

/**
 * 章タイトル・あらすじ(大枠)・プレイヤー名・専用デッキの仲間キャラクター一覧から
 * ユーザーメッセージを構築する。このモジュール自身はAI呼び出しを行わない
 * (`lib/stories/generate.ts`が担当)。
 */
export function buildStoryPrompt(
  chapterTitle: string,
  outline: string,
  username: string,
  deckName: string,
  roster: StoryRosterMember[]
): string {
  return [
    `プレイヤー名: ${username}`,
    `プレイヤーの専用デッキ「${deckName}」の仲間キャラクター一覧:`,
    formatRoster(roster),
    `章タイトル: ${chapterTitle}`,
    `あらすじ(大枠):`,
    outline,
    "",
    `上記のあらすじを、「${username}」が主人公として活躍し、必要に応じて上記の仲間キャラクターの` +
      `中から話に合う人物を選んで活躍させる物語本文に書き直し、下書きや文字数の検討は行わず、` +
      `{"story": "物語本文"} というJSON形式のみをそのまま出力してください。`,
  ].join("\n");
}

/**
 * AI応答からJSON(`{"story": "..."}`)を抽出し、`story`フィールドの文字列を返す。
 * コードフェンスの除去は`lib/battles/parseResponse.ts`の`extractJson`と同じ方針。
 * パースに失敗した場合・`story`が文字列でない場合は`null`を返す。
 */
export function extractStoryContent(rawText: string): string | null {
  const trimmed = rawText.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // 一部のモデルはJSONの前後に思考過程を付け足すことがあるため、
  // 応答中で最初に現れる `{` から最後に現れる `}` までを切り出してから解釈する。
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  try {
    const data: unknown = JSON.parse(withoutFence.slice(start, end + 1));
    if (data && typeof data === "object" && typeof (data as { story?: unknown }).story === "string") {
      const story = (data as { story: string }).story.trim();
      return story.length > 0 ? story : null;
    }
  } catch {
    return null;
  }
  return null;
}
