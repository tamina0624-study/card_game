/**
 * ストーリー機能のリポジトリ層。
 *
 * MySQLへは直接接続せず、PHPブリッジ(`php/stories.php`)にHTTP経由でアクセスする
 * (`lib/characters/repository.ts`と同じ方針)。ログイン中ユーザーの解決
 * (Cookie→トークン→ユーザー)は`lib/auth/session.ts`の責務であり、ここでは
 * 解決済みの`userId`をプレーンな値として受け取るのみとする。
 *
 * 章内は`story_beats`(順序付きの「ストーリー」「戦闘イベント」)の並びで構成され、
 * 各ビートの生成・戦闘結果はユーザーごとに`story_beat_progress`へ記録される
 * (`src/lib/types.ts`の`StoryBeat`参照)。
 */

import { BridgeError, callBridge } from "@/lib/bridge/client";
import type {
  StoryBeatContext,
  StoryBlessing,
  StoryChapterDetail,
  StoryChapterSummary,
  StoryHistoryEntry,
} from "@/lib/types";

/** 公開済みストーリー章の一覧を取得する。`userId`指定時は各章の`playedAt`が埋まる。 */
export async function listStoryChapters(userId?: number): Promise<StoryChapterSummary[]> {
  return callBridge<StoryChapterSummary[]>("stories.php", { query: { userId } });
}

/** id指定で章の詳細(`beats`含む)を取得する。存在しない場合は`null`。 */
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

/**
 * ビート単体+その親章の文脈を取得する(`/api/stories/beats/:beatId/play`・`/battle`が使う)。
 * 存在しない場合は`null`。
 */
export async function getStoryBeat(beatId: number, userId?: number): Promise<StoryBeatContext | null> {
  try {
    return await callBridge<StoryBeatContext>("stories.php", {
      query: { action: "get-beat", id: beatId, userId },
    });
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
 * AI生成済みの個別化ストーリー本文を保存する(`beatType==="story"`のビートのみ)。
 * 既に保存済みの場合は上書きせず既存の内容をそのまま返す(冪等、PHP側`INSERT IGNORE`による)。
 * 生成と同時にそのビートは完了扱いになる。
 */
export async function playStoryBeat(
  userId: number,
  beatId: number,
  content: string,
  rawAiResponse: string
): Promise<{ beatId: number; content: string | null; createdAt: string; clearedAt: string | null }> {
  return callBridge("stories.php", {
    method: "POST",
    body: { action: "play-beat", userId, beatId, content, rawAiResponse },
  });
}

/**
 * 戦闘ビート勝利時にそのビートを完了扱いにする(`beatType==="battle"`のビートのみ)。
 * 既にクリア済みの場合は何もせず現在の状態を返す(冪等)。呼び出し元は
 * `src/app/api/stories/beats/[beatId]/battle/route.ts`(勝利時のみ呼び出す)。
 */
export async function markBeatCleared(
  userId: number,
  beatId: number
): Promise<{ beatId: number; content: string | null; createdAt: string; clearedAt: string | null }> {
  return callBridge("stories.php", {
    method: "POST",
    body: { action: "mark-beat-cleared", userId, beatId },
  });
}

/** 章内の戦闘への現在の挑戦回数(祝福度)を取得する。まだ1回も挑戦していなければ`battleCount: 0`。 */
export async function getStoryBlessing(userId: number, chapterId: number): Promise<StoryBlessing> {
  return callBridge<StoryBlessing>("stories.php", {
    query: { action: "get-blessing", userId, chapterId },
  });
}

/** 章内の戦闘に1回挑戦したことを記録する(勝敗問わず呼び出す)。更新後の挑戦回数を返す。 */
export async function incrementStoryBlessing(userId: number, chapterId: number): Promise<StoryBlessing> {
  return callBridge<StoryBlessing>("stories.php", {
    method: "POST",
    body: { action: "increment-blessing", userId, chapterId },
  });
}
