import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listStoryChapters, listStoryHistory } from "@/lib/stories/repository";

/**
 * ストーリー章一覧ページ(サーバーコンポーネント)。
 *
 * `lib/stories/repository.ts` を直接呼び出す(`src/app/decks/page.tsx` と同じ方針)。
 * 未ログインの場合はログイン/新規登録への導線を表示し、ログイン中の場合は
 * 各章の `playedAt` に応じて「プレイ済み」バッジを出し分ける。
 * ログイン中はさらに `listStoryHistory` でプレイ済みの章だけを集めた
 * 「振り返り」セクションも表示する(追加機能20260707.md「振り返りが出来るようにする」)。
 *
 * `chapter.locked`(追加機能20260708.md「ストーリーモードに戦闘を組み込みたい」対応、
 * 前章クリア判定)な章はタイトル・あらすじを一切表示せず、クリック不可の非活性カードに
 * する(URLを推測されても`/stories/[id]`側でも同様にロックするため二重の防御になる)。
 * ただし未ログインの場合はPHP側が全章を`locked: true`として返す(ユーザーごとの
 * 進行状況が無いため)仕様上、この判定をそのまま使うと従来できていた「ログイン前でも
 * あらすじだけは読める」プレビューができなくなってしまう。そのため実際のロック表示は
 * `Boolean(user) && chapter.locked` で行い、未ログイン時は従来通り全章のあらすじを
 * 表示したままログインを促す(実際のプレイ・戦闘操作はいずれもAPI側で401になる)。
 */
export const dynamic = "force-dynamic";

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

export default async function StoriesPage() {
  const user = await getCurrentUser();
  const chapters = await listStoryChapters(user?.id);
  const history = user ? await listStoryHistory(user.id) : [];

  return (
    <div className="page-bg">
      <div className="page-bg__content">
        <div className="page-header">
          <h1>ストーリー</h1>
        </div>

        {!user && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <p>
              ストーリーを進めるにはログインが必要です。<Link href="/login">ログイン</Link>{" "}
              または <Link href="/register">新規登録</Link>してください。
            </p>
          </div>
        )}

        {chapters.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>まだ公開されているストーリーがありません。</p>
        ) : (
          <div className="story-list">
            {chapters.map((chapter) =>
              Boolean(user) && chapter.locked ? (
                <div
                  key={chapter.id}
                  className="card story-card story-card--locked"
                  aria-disabled="true"
                >
                  <div className="story-card__header">
                    <span className="story-card__number">第{chapter.chapterNumber}章</span>
                    <span className="badge">🔒 未解放</span>
                  </div>
                  <p className="story-card__outline">前の章をクリアすると解放されます。</p>
                </div>
              ) : (
                <Link key={chapter.id} href={`/stories/${chapter.id}`} className="card story-card">
                  <div className="story-card__header">
                    <span className="story-card__number">第{chapter.chapterNumber}章</span>
                    {chapter.playedAt && <span className="badge badge--win">プレイ済み</span>}
                  </div>
                  <h2 className="story-card__title">{chapter.title}</h2>
                  <p className="story-card__outline">{chapter.outline}</p>
                </Link>
              )
            )}
          </div>
        )}

        {user && history.length > 0 && (
          <section className="card story-history" style={{ marginTop: "2rem" }}>
            <h2 style={{ marginBottom: "1rem" }}>振り返り(プレイ済みの冒険)</h2>
            <ul className="story-history-list">
              {history.map((entry) => (
                <li key={entry.chapterId} className="story-history-list__item">
                  <Link href={`/stories/${entry.chapterId}`}>
                    第{entry.chapterNumber}章 {entry.chapterTitle}
                  </Link>
                  <span className="story-history-list__date">{formatDateTime(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
