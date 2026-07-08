/**
 * マスコットキャラクターの「祝福」倍率(追加機能20260708.md「戦闘は勝たなくても、
 * 回数を重ねると強くなるようにする」対応)。
 *
 * 章内の雑魚戦・ボス戦に挑戦するたび(勝敗問わず、`story_blessings.battle_count`)、
 * その章の中でだけユーザーのデッキキャラクターの各種パラメータに倍率がかかる
 * (`lib/battles/prompt.ts`の`buildBattlePrompt`でプロンプト整形時にのみ適用し、
 * `character_parameters`テーブルへは一切書き戻さない=通常のPvP対戦や
 * キャラクターシート表示には影響しない)。
 */

/**
 * 挑戦回数から倍率を求める。1回挑戦するごとに+10%、上限は+100%(2倍)。
 * 上限を設けているのは、雑魚戦を際限なく周回してボス戦を無意味にしてしまわないため。
 */
export function blessingMultiplier(battleCount: number): number {
  const safeCount = Math.max(0, battleCount);
  return Math.min(1 + safeCount * 0.1, 2);
}
