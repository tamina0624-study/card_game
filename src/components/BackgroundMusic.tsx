"use client";

import { useEffect } from "react";
import { musicController } from "@/lib/audio/musicController";

/**
 * 全画面共通のBGM開始トリガー(ルートレイアウトに1つだけ配置する)。
 * 実際の再生状態(BaseMusic⇔BattleMusic)は`musicController`側で一元管理し、
 * 戦闘画面(`BattleSetupForm`)が開いている間はそちらがBattleMusicへ切り替える。
 */
export default function BackgroundMusic() {
  useEffect(() => {
    musicController.playBase();
  }, []);

  return null;
}
