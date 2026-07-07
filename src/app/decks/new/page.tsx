import Link from "next/link";
import DeckForm from "@/components/DeckForm";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * デッキ編成(作成)ページ。
 * フォーム本体は `DeckForm`(`src/app/decks/[id]/edit/page.tsx` と共通)。
 * ログイン中は作成者名の初期値をユーザー名にし、このデッキがそのユーザーの
 * 専用デッキ(ストーリーモードで使用、追加機能20260707)として登録されるようにする。
 *
 * 未ログインの場合は作成させない(ログインしないまま作成すると誰の所有にもならず、
 * `src/app/decks/page.tsx` の一覧(自分のデッキのみ表示)に二度と出てこなくなるため)。
 * `src/app/stories/page.tsx` と同じ方針でログイン/新規登録への導線のみ表示する。
 */
export default async function NewDeckPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="card">
        <p>
          デッキの作成にはログインが必要です。<Link href="/login">ログイン</Link>{" "}
          または <Link href="/register">新規登録</Link>してください。
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>デッキ編成</h1>
      <DeckForm mode="create" defaultOwnerName={user.username} />
    </div>
  );
}
