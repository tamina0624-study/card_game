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
import type { BattleSummary, StoryBeat } from "@/lib/types";

/**
 * ストーリー章詳細ページ(サーバーコンポーネント)。
 *
 * `lib/stories/repository.ts` の `getStoryChapter(id, userId)` を直接呼び出し、
 * 章のあらすじ(大枠)と、章内に順序付きで並ぶビート(`beats`、`beatType==="story"`の
 * ストーリー・`beatType==="battle"`の戦闘イベント)を表示する。
 *
 * 章内のビートは「直前のビートが完了するまで次はロック」という順送りのため、
 * ある時点でユーザーから見えるのは常に「完了済みの先頭区間」+「現在挑戦中の1件」まで
 * (それより先は🔒のプレースホルダーのみを表示し、タイトル・あらすじは一切出さない)。
 * ログイン中でまだ自分専用のデッキが無い場合は、先にデッキ作成を案内する
 * (ビート内のロスターや戦闘に自分のデッキが必要なため)。
 *
 * `mascotCharacterId`が設定されていれば、その章のマスコットキャラクターと現在の
 * 「祝福」レベル(`getStoryBlessing`→`blessingMultiplier`、章単位で戦闘への総挑戦回数から算出)を
 * 表示する。戦闘ビートに勝利すると次のビート・次章が解放される
 * (`markBeatCleared`、APIルート側の処理)。
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
          <p>🔒 この章はまだ解放されていません。前の章の最後まで進めると解放されます。</p>
        </div>
      </div>
    );
  }

  const deck = user ? await getUserDeck(user.id) : null;

  const mascot = chapter.mascotCharacterId !== null ? await getCharacterById(chapter.mascotCharacterId) : null;
  const blessing = user ? await getStoryBlessing(user.id, chapter.id) : null;
  const multiplier = blessing ? blessingMultiplier(blessing.battleCount) : 1;

  // 章内のビートは順送りロック(直前のビートが完了するまで次はロック)のため、
  // ユーザーが今表示できるのは「完了済みの先頭区間」+「現在挑戦中(未ロック・未完了)の1件」まで。
  const visibleBeats: StoryBeat[] = [];
  let hasMoreLocked = false;
  if (user && deck) {
    for (const beat of chapter.beats) {
      if (beat.locked) {
        hasMoreLocked = true;
        break;
      }
      visibleBeats.push(beat);
    }
  }

  const battlesByBeatId = new Map<number, BattleSummary[]>();
  if (user) {
    for (const beat of visibleBeats) {
      if (beat.beatType === "battle" && beat.deckId !== null) {
        battlesByBeatId.set(beat.id, await listStoryBattles(user.id, beat.id));
      }
    }
  }

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
            (このデッキで章内の戦闘に挑みます)。
          </p>
          <Link href="/decks/new" className="button button-primary">
            専用デッキを作成する
          </Link>
        </div>
      )}

      {user &&
        deck &&
        visibleBeats.map((beat) => (
          <section key={beat.id} className="card story-detail__content" style={{ marginTop: "1.5rem" }}>
            <h2 style={{ marginBottom: "0.75rem" }}>
              {beat.title}
              {beat.beatType === "battle" && beat.clearedAt && (
                <span className="badge badge--win" style={{ marginLeft: "0.5rem" }}>
                  クリア済み
                </span>
              )}
            </h2>

            {beat.illustrationUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- ローカルの挿絵画像をそのまま表示するため
              <img src={beat.illustrationUrl} alt={beat.title} className="story-detail__illustration" />
            )}

            {beat.beatType === "story" && beat.content !== null && (
              <>
                {beat.createdAt && <p className="story-detail__meta">記録日時: {formatDateTime(beat.createdAt)}</p>}
                <div className="story-detail__body">
                  {beat.content
                    .split(/\n+/)
                    .filter((paragraph) => paragraph.trim().length > 0)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              </>
            )}

            {beat.beatType === "story" && beat.content === null && (
              <div className="story-detail__start">
                <p style={{ marginBottom: "1rem" }}>
                  {user.username}さんが主人公として活躍する物語をAIが書き下ろします。
                  一度生成した内容は、このページからいつでも読み返せます。
                </p>
                <StoryPlayButton beatId={beat.id} />
              </div>
            )}

            {beat.beatType === "battle" && beat.deckId === null && (
              <p style={{ color: "var(--muted)" }}>この戦闘イベントはまだ準備中です。</p>
            )}

            {beat.beatType === "battle" && beat.deckId !== null && (
              <div className="story-detail__battle">
                <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
                  {beat.clearedAt
                    ? "既にクリア済みです。もう一度挑んで祝福を重ねることもできます。"
                    : "勝利すると次へ進めます。"}
                </p>
                <StoryBattleButton beatId={beat.id} label={beat.title} />
                {(battlesByBeatId.get(beat.id)?.length ?? 0) > 0 && (
                  <ul className="story-history-list" style={{ marginTop: "1rem" }}>
                    {battlesByBeatId.get(beat.id)!.map((battle) => (
                      <li key={battle.id} className="story-history-list__item">
                        <Link href={`/battles/${battle.id}`}>
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
                )}
              </div>
            )}
          </section>
        ))}

      {user && deck && hasMoreLocked && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p>🔒 この先に、まだ見ぬストーリー・戦闘が待っています。</p>
        </div>
      )}
    </div>
  );
}
