import Link from "next/link";
import { notFound } from "next/navigation";
import StoryPlayButton from "@/components/StoryPlayButton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStoryChapter } from "@/lib/stories/repository";

/**
 * ストーリー章詳細ページ(サーバーコンポーネント)。
 *
 * `lib/stories/repository.ts` の `getStoryChapter(id, userId)` を直接呼び出し、
 * 章のあらすじ(大枠)を表示する。ログイン中でまだプレイしていない場合は
 * `StoryPlayButton`(クライアントコンポーネント)を表示し、既にプレイ済みの場合は
 * AIが生成した個別化ストーリー本文をそのまま表示する(振り返り)。
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

      {!user && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p>
            この章を進めるには<Link href="/login">ログイン</Link>してください。
          </p>
        </div>
      )}

      {user && !chapter.play && (
        <div className="card story-detail__start" style={{ marginTop: "1.5rem" }}>
          <p style={{ marginBottom: "1rem" }}>
            {user.username}さんが主人公として活躍する物語をAIが書き下ろします。一度生成した内容は、
            この章のページからいつでも読み返せます。
          </p>
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
    </div>
  );
}
