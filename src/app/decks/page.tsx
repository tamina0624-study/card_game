import Link from "next/link";
import DeleteButton from "@/components/DeleteButton";
import { listDecks } from "@/lib/decks/repository";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * デッキ一覧ページ(サーバーコンポーネント)。
 *
 * `lib/decks/repository.ts` を直接呼び出し、常に最新の一覧を表示する
 * (`src/app/characters/page.tsx` と同じ方針)。デッキ名・作成者名・作成日時のみを
 * 表示する概要一覧であり(`DeckSummary`、front/bench等の詳細はここでは表示しない)、
 * `/decks/new` への導線を設置する。
 *
 * ログイン中のユーザーが作成したデッキのみを表示する(`listDecks(user.id)`。
 * 他ユーザーが作成したデッキは一覧・編集画面のどちらにも出さない)。未ログインの場合は
 * `src/app/stories/page.tsx` と同じ方針でログイン/新規登録への導線のみ表示する。
 *
 * 背景は `.page-bg`(`src/app/page.tsx`・`src/app/characters/page.tsx` と共通、
 * `docs/参考画像/ゲーム画面イメージ/Top画面の背景イメージ.png`)。
 */
export const dynamic = "force-dynamic";

/** SQLiteの `datetime('now')` 形式("YYYY-MM-DD HH:MM:SS"、UTC)を日本語表記に整形する。 */
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

export default async function DecksPage() {
  const user = await getCurrentUser();
  const decks = user ? await listDecks(user.id) : [];

  return (
    <div className="page-bg">
      <div className="page-bg__content">
        <div className="page-header">
          <h1>デッキ一覧</h1>
          <Link href="/decks/new" className="button button-primary">
            + 新しいデッキを編成
          </Link>
        </div>

        {!user && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <p>
              デッキの作成・編集にはログインが必要です。<Link href="/login">ログイン</Link>{" "}
              または <Link href="/register">新規登録</Link>してください。
            </p>
          </div>
        )}

        {user && (decks.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            まだデッキが登録されていません。「新しいデッキを編成」から最初の1つを作りましょう。
          </p>
        ) : (
          <div className="deck-grid">
            {decks.map((deck) => (
              <div key={deck.id} className="card deck-card">
                <h2 className="deck-card__name">{deck.name}</h2>
                <p className="deck-card__owner">作成者: {deck.ownerName ?? "未設定"}</p>
                <p className="deck-card__date">作成日時: {formatDateTime(deck.createdAt)}</p>
                <div className="card-actions">
                  <Link href={`/decks/${deck.id}/edit`} className="button button-secondary">
                    編集
                  </Link>
                  <DeleteButton
                    endpoint={`/api/decks/${deck.id}`}
                    confirmMessage={`「${deck.name}」を削除しますか?この操作は取り消せません。`}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
