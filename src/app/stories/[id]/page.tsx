import Link from "next/link";
import { notFound } from "next/navigation";
import StoryPlayButton from "@/components/StoryPlayButton";
import StoryBattleButton from "@/components/StoryBattleButton";
import { getCurrentUser } from "@/lib/auth/session";
import { getCharacterById } from "@/lib/characters/repository";
import { getUserDeck } from "@/lib/decks/repository";
import { listStoryBattles } from "@/lib/battles/repository";
import { blessingMultiplier } from "@/lib/stories/blessing";
import { getStoryBlessing, getStoryChapter } from "@/lib/stories/repository";
import type { BattleStoryPhase } from "@/lib/types";

/**
 * ストーリー章詳細ページ(サーバーコンポーネント)。
 *
 * `lib/stories/repository.ts` の `getStoryChapter(id, userId)` を直接呼び出し、
 * 章のあらすじ(大枠)を表示する。ログイン中でまだプレイしていない場合、
 * ユーザーの専用デッキ(`lib/decks/repository.ts` の `getUserDeck`、
 * 追加機能20260707「ユーザー専用のデッキ」対応)が無ければ先に作成するよう案内し、
 * あれば仲間キャラクター一覧を添えて `StoryPlayButton`(クライアントコンポーネント)を
 * 表示する。既にプレイ済みの場合はAIが生成した個別化ストーリー本文をそのまま表示する
 * (振り返り)。
 *
 * 追加機能20260708.md「ストーリーモードに戦闘を組み込みたい」対応:
 * - `chapter.locked`(前章クリア判定)がログイン中ユーザーについて`true`の場合、
 *   あらすじ・本文を一切出さずロック案内のみを表示する(URL直打ちでの先読み防止。
 *   未ログイン時の扱いは`src/app/stories/page.tsx`と同じ理由で除外する)。
 * - `mascotCharacterId`が設定されていれば、その章のマスコットキャラクターと
 *   現在の「祝福」レベル(`getStoryBlessing`→`blessingMultiplier`)を表示する。
 * - `mobDeckId`/`bossDeckId`が設定されていれば、それぞれ`StoryBattleButton`で
 *   雑魚戦・ボス戦に挑めるようにする(戦闘結果は既存の`/battles/[id]`へ遷移して見る)。
 *   ボス戦に勝利すると次章が解放される(`markChapterCleared`、APIルート側の処理)。
 * - これまでの挑戦履歴(`listStoryBattles`)を一覧表示する。
 */

/** MySQLの `DATETIME`("YYYY-MM-DD HH:MM:SS"、UTC)を日本語表記に整形する。 */
function formatDateTime(value: string): string {
  const isoLike = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PHASE_HEADING: Record<BattleStoryPhase, string> = {
  mob: "雑魚戦",
  boss: "ボス戦",
};

const BATTLE_STATUS_LABEL: Record<string, string> = {
  pending: "準備中",
  running: "対戦中",
  completed: "完了",
  failed: "失敗",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StoryDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  const chapter = await getStoryChapter(Number(id), user?.id);
  if (!chapter) {
    notFound();
  }

  // 未ログイン時はPHP側が(ユーザーごとの進行状況が無いため)全章を`locked: true`として
  // 返す仕様上、そのまま使うと「ログイン前でもあらすじだけは読める」という従来の
  // プレビュー体験ができなくなってしまう。そのため実際のロック判定は
  // ログイン中のユーザーについてのみ適用する(`src/app/stories/page.tsx`と同じ方針)。
  const locked = Boolean(user) && chapter.locked;

  if (locked) {
    return (
      <div>
        <div className="page-header">
          <h1>第{chapter.chapterNumber}章</h1>
          <Link href="/stories" className="button button-secondary">
            ストーリー一覧に戻る
          </Link>
        </div>
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p>🔒 この章はまだ解放されていません。前の章のボス戦をクリア(ボス戦が無い章は物語を読了)すると解放されます。</p>
        </div>
      </div>
    );
  }

  const deck = user ? await getUserDeck(user.id) : null;
  const roster = deck ? [...deck.front, ...deck.bench] : [];

  const mascot = chapter.mascotCharacterId !== null ? await getCharacterById(chapter.mascotCharacterId) : null;
  const blessing = user ? await getStoryBlessing(user.id, chapter.id) : null;
  const multiplier = blessing ? blessingMultiplier(blessing.battleCount) : 1;

  const battles = user && (chapter.mobDeckId !== null || chapter.bossDeckId !== null)
    ? await listStoryBattles(user.id, chapter.id)
    : [];

  return (
    <div>
      <div className="page-header">
        <h1>
          第{chapter.chapterNumber}章 {chapter.title}
        </h1>
        <Link href="/stories" className="button button-secondary">
          ストーリー一覧に戻る
        </Link>
      </div>

      <section className="card story-detail__outline">
        <h2 style={{ marginBottom: "0.75rem" }}>あらすじ</h2>
        <p>{chapter.outline}</p>
      </section>

      {mascot && (
        <section className="card story-detail__mascot" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>この章のマスコット</h2>
          <div className="story-detail__mascot-body">
            {mascot.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
              <img src={mascot.imageUrl} alt={mascot.name} className="story-detail__mascot-thumb" />
            )}
            <div>
              <p className="story-detail__mascot-name">{mascot.name}</p>
              {mascot.description && <p style={{ color: "var(--muted)" }}>{mascot.description}</p>}
              {blessing && (
                <p className="badge" style={{ marginTop: "0.5rem" }}>
                  祝福 挑戦{blessing.battleCount}回・パラメータ+{Math.round((multiplier - 1) * 100)}%
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {!user && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p>
            この章を進めるには<Link href="/login">ログイン</Link>してください。
          </p>
        </div>
      )}

      {user && !deck && (
        <div className="card story-detail__start" style={{ marginTop: "1.5rem" }}>
          <p style={{ marginBottom: "1rem" }}>
            ストーリーを進めるには、あなた専用のデッキが必要です。先にデッキを編成してください
            (このデッキの仲間たちが物語・戦闘に登場します)。
          </p>
          <Link href="/decks/new" className="button button-primary">
            専用デッキを作成する
          </Link>
        </div>
      )}

      {user && deck && chapter.mobDeckId !== null && (
        <section className="card story-detail__battle" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>{PHASE_HEADING.mob}</h2>
          <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
            負けても構いません。挑むたびにマスコットの祝福が積み重なっていきます。
          </p>
          <StoryBattleButton chapterId={chapter.id} phase="mob" />
        </section>
      )}

      {user && deck && !chapter.play && (
        <div className="card story-detail__start" style={{ marginTop: "1.5rem" }}>
          <p style={{ marginBottom: "1rem" }}>
            {user.username}さんが主人公として活躍する物語をAIが書き下ろします。デッキ「{deck.name}」の
            仲間の中から話に合う人物が登場します。一度生成した内容は、この章のページからいつでも
            読み返せます。
          </p>
          {roster.length > 0 && (
            <ul className="story-detail__roster">
              {roster.map((character) => (
                <li key={character.id}>{character.name}</li>
              ))}
            </ul>
          )}
          <StoryPlayButton chapterId={chapter.id} />
        </div>
      )}

      {chapter.play && (
        <section className="card story-detail__content" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>{user?.username ?? ""}の物語</h2>
          <p className="story-detail__meta">記録日時: {formatDateTime(chapter.play.createdAt)}</p>
          <div className="story-detail__body">
            {chapter.play.content
              .split(/\n+/)
              .filter((paragraph) => paragraph.trim().length > 0)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </section>
      )}

      {user && deck && chapter.bossDeckId !== null && (
        <section className="card story-detail__battle" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>
            {PHASE_HEADING.boss}
            {chapter.play?.clearedAt && <span className="badge badge--win" style={{ marginLeft: "0.5rem" }}>クリア済み</span>}
          </h2>
          <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
            {chapter.play?.clearedAt
              ? "既にクリア済みです。もう一度挑んで祝福を重ねることもできます。"
              : "ボス戦に勝利すると、この章がクリア扱いになり次の章が解放されます。"}
          </p>
          <StoryBattleButton chapterId={chapter.id} phase="boss" />
        </section>
      )}

      {battles.length > 0 && (
        <section className="card story-detail__history" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>これまでの挑戦</h2>
          <ul className="story-history-list">
            {battles.map((battle) => (
              <li key={battle.id} className="story-history-list__item">
                <Link href={`/battles/${battle.id}`}>
                  {battle.storyPhase ? PHASE_HEADING[battle.storyPhase] : "戦闘"} -{" "}
                  {battle.status === "completed" && battle.winner
                    ? battle.winner === "teamA"
                      ? "勝利"
                      : "敗北"
                    : BATTLE_STATUS_LABEL[battle.status]}
                </Link>
                <span className="story-history-list__date">{formatDateTime(battle.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
