/**
 * ストーリー個別化AIの呼び出し本体(`lib/battles/parseResponse.ts`の
 * `generateBattleWithRetry`相当)。JSON(`{"story": "..."}`)としてパースできない
 * 応答が返ってきた場合、1回だけ訂正指示付きで再試行する。無料枠の軽量モデルは
 * 自由記述の指示だけでは思考過程を出力に混ぜてしまうことがあるため
 * (`lib/stories/prompt.ts`のコメント参照)、パース失敗時の再試行を設けている。
 */

import { callWithSystemPrompt } from "@/lib/claude/client";
import { buildStoryPrompt, extractStoryContent, STORY_SYSTEM_PROMPT } from "@/lib/stories/prompt";

/**
 * ストーリービートのタイトル・あらすじ・プレイヤー名から個別化ストーリー本文を生成する。
 * `content`(表示用の物語本文)と`rawText`(監査用の、採用した方の生応答)を返す。
 * 2回とも`{"story": "..."}`としてパースできなかった場合は、2回目の生応答を前後の
 * 空白を除いてそのままフォールバックとして使う(空応答は避けるが、内容の品質は保証しない)。
 * APIが投げる例外はそのまま呼び出し元に伝播させる。
 */
export async function generateStoryContent(
  beatTitle: string,
  outline: string,
  username: string
): Promise<{ content: string; rawText: string }> {
  const prompt = buildStoryPrompt(beatTitle, outline, username);

  const firstRawText = await callWithSystemPrompt(STORY_SYSTEM_PROMPT, prompt, 6000);
  const firstContent = extractStoryContent(firstRawText);
  if (firstContent) {
    return { content: firstContent, rawText: firstRawText };
  }

  const retryPrompt =
    `${prompt}\n\n前回の出力はJSON({"story": "..."})として解釈できませんでした。` +
    `思考過程やコードフェンスを含めず、{"story": "物語本文"} という1つのJSONオブジェクトのみを出力してください。`;
  const secondRawText = await callWithSystemPrompt(STORY_SYSTEM_PROMPT, retryPrompt, 6000);
  const secondContent = extractStoryContent(secondRawText);
  if (secondContent) {
    return { content: secondContent, rawText: secondRawText };
  }

  return { content: secondRawText.trim() || firstRawText.trim(), rawText: secondRawText };
}
