import DeckForm from "@/components/DeckForm";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * デッキ編成(作成)ページ。
 * フォーム本体は `DeckForm`(`src/app/decks/[id]/edit/page.tsx` と共通)。
 * ログイン中は作成者名の初期値をユーザー名にし、このデッキがそのユーザーの
 * 専用デッキ(ストーリーモードで使用、追加機能20260707)として登録されるようにする。
 */
export default async function NewDeckPage() {
  const user = await getCurrentUser();

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>デッキ編成</h1>
      <DeckForm mode="create" defaultOwnerName={user?.username} />
    </div>
  );
}
