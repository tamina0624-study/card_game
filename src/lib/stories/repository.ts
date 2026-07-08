/**
 * ストーリー機能のリポジトリ層。
 *
 * MySQLへは直接接続せず、PHPブリッジ(`php/stories.php`)にHTTP経由でアクセスする
 * (`lib/characters/repository.ts`と同じ方針)。ログイン中ユーザーの解決
 * (Cookie→トークン→ユーザー)は`lib/auth/session.ts`の責務であり、ここでは
 * 解決済みの`userId`をプレーンな値として受け取るのみとする。
 */

import { BridgeError, callBridge } from "@/lib/bridge/client";
import type {
  StoryBlessing,
  StoryChapterDetail,
  StoryChapterSummary,
  StoryHistoryEntry,
  StoryPlay,
} from "@/lib/types";

/** 公開済みストーリー章の一覧を取得する。`userId`指定時は各章の`playedAt`が埋まる。 */
export async function listStoryChapters(userId?: number): Promise<StoryChapterSummary[]> {
  return callBridge<StoryChapterSummary[]>("stories.php", { query: { userId } });
}

/** id指定で章の詳細を取得する。存在しない場合は`null`。`userId`指定時は`play`(生成済み本文)も含む。 */
export async function getStoryChapter(id: number, userId?: number): Promise<StoryChapterDetail | null> {
  try {
    return await callBridge<StoryChapterDetail>("stories.php", { query: { id, userId } });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 404 && error.code === null) {
      return null;
    }
    throw error;
  }
}

/** 指定ユーザーの全プレイ履歴(振り返り)を章番号順で取得する。 */
export async function listStoryHistory(userId: number): Promise<StoryHistoryEntry[]> {
  return callBridge<StoryHistoryEntry[]>("stories.php", { query: { action: "my-plays", userId } });
}

/**
 * AI生成済みの個別化ストーリー本文を保存する。既に同じユーザー・章の組み合わせで
 * 保存済みの場合は上書きせず既存の内容をそのまま返す(冪等、PHP側`INSERT IGNORE`による)。
 */
export async function saveStoryPlay(
  userId: number,
  chapterId: number,
  content: string,
  rawAiResponse: string
): Promise<StoryPlay> {
  return callBridge<StoryPlay>("stories.php", {
    method: "POST",
    body: { action: "save-play", userId, chapterId, content, rawAiResponse },
  });
}

/**
 * ボス戦勝利時に章をクリア扱いにする(`story_plays.cleared_at`を確定させる)。
 * 既にクリア済みの場合は何もせず現在の状態を返す(冪等)。呼び出し元は
 * `src/app/api/stories/[id]/battle/route.ts`(ボス戦勝利時のみ呼び出す)。
 */
export async function markChapterCleared(userId: number, chapterId: number): Promise<StoryPlay> {
  return callBridge<StoryPlay>("stories.php", {
    method: "POST",
    body: { action: "mark-cleared", userId, chapterId },
  });
}

/** 章内の雑魚戦・ボス戦への現在の挑戦回数(祝福度)を取得する。まだ1回も挑戦していなければ`battleCount: 0`。 */
export async function getStoryBlessing(userId: number, chapterId: number): Promise<StoryBlessing> {
  return callBridge<StoryBlessing>("stories.php", {
    query: { action: "get-blessing", userId, chapterId },
  });
}

/** 章内の雑魚戦・ボス戦に1回挑戦したことを記録する(勝敗問わず呼び出す)。更新後の挑戦回数を返す。 */
export async function incrementStoryBlessing(userId: number, chapterId: number): Promise<StoryBlessing> {
  return callBridge<StoryBlessing>("stories.php", {
    method: "POST",
    body: { action: "increment-blessing", userId, chapterId },
  });
}
