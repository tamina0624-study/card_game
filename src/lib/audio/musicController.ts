/**
 * BGM/効果音の再生を一元管理するシングルトン。
 *
 * ルートレイアウト(`BackgroundMusic`)で常時BaseMusicをループ再生し、戦闘画面
 * (`BattleSetupForm`の戦闘ポップアップ)が開いている間だけBattleMusicに切り替える。
 * ブラウザの自動再生制限(ユーザー操作前は音声付き再生がブロックされる)に対応するため、
 * `play()`が拒否された場合は最初のクリック/キー操作で再試行する。
 */
"use client";

import { assetUrl } from "@/lib/assets";

type Track = "base" | "battle";

const SOUND_DIR = assetUrl("/sound");
const MUSIC_VOLUME = 0.45;
const SFX_VOLUME = 0.8;

class MusicController {
  private base: HTMLAudioElement | null = null;
  private battle: HTMLAudioElement | null = null;
  private current: Track = "base";
  private unlockArmed = false;

  private ensureAudios() {
    if (typeof window === "undefined") {
      return;
    }
    if (!this.base) {
      this.base = new Audio(`${SOUND_DIR}/BaseMusic.mp3`);
      this.base.loop = true;
      this.base.volume = MUSIC_VOLUME;
    }
    if (!this.battle) {
      this.battle = new Audio(`${SOUND_DIR}/BattleMusic.mp3`);
      this.battle.loop = true;
      this.battle.volume = MUSIC_VOLUME;
    }
  }

  /** 自動再生がブロックされた場合、次のユーザー操作(クリック/キー入力)で再生を再試行する。 */
  private armUnlockOnInteraction() {
    if (this.unlockArmed || typeof window === "undefined") {
      return;
    }
    this.unlockArmed = true;
    const retry = () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      this.unlockArmed = false;
      const audio = this.current === "base" ? this.base : this.battle;
      audio?.play().catch(() => this.armUnlockOnInteraction());
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
  }

  private switchTo(track: Track) {
    this.ensureAudios();
    if (!this.base || !this.battle) {
      return;
    }
    this.current = track;
    const [next, other] = track === "base" ? [this.base, this.battle] : [this.battle, this.base];
    other.pause();
    next.play().catch(() => this.armUnlockOnInteraction());
  }

  /** 通常画面向けBGM(BaseMusic)をループ再生する。すでに再生中なら何もしない。 */
  playBase() {
    if (this.current === "base" && this.base && !this.base.paused) {
      return;
    }
    this.switchTo("base");
  }

  /** 戦闘画面向けBGM(BattleMusic)をループ再生する。すでに再生中なら何もしない。 */
  playBattle() {
    if (this.current === "battle" && this.battle && !this.battle.paused) {
      return;
    }
    this.switchTo("battle");
  }

  private playOneShot(fileName: string) {
    if (typeof window === "undefined") {
      return;
    }
    const sfx = new Audio(`${SOUND_DIR}/${fileName}`);
    sfx.volume = SFX_VOLUME;
    sfx.play().catch(() => {
      // 効果音は自動再生解除のトリガーには使わない(BGM側の解除に任せる)。
    });
  }

  /** 通常攻撃の効果音(AttackSound)を1回再生する。 */
  playAttackSound() {
    this.playOneShot("AttackSound.mp3");
  }

  /** 必殺技発動の効果音(SPAtackSound)を1回再生する。 */
  playSpecialSound() {
    this.playOneShot("SPAtackSound.mp3");
  }
}

export const musicController = new MusicController();
