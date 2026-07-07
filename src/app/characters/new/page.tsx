import Link from "next/link";
import CharacterForm from "@/components/CharacterForm";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * キャラクター作成ページ。
 * フォーム本体は `CharacterForm`(`src/app/characters/[id]/edit/page.tsx` と共通)。
 *
 * 未ログインの場合は作成させない(ログインしないまま作成すると誰の所有にもならず、
 * `src/app/characters/page.tsx` の一覧(システムキャラクター+自分のキャラクターのみ
 * 表示)に二度と出てこなくなるため。`src/app/decks/new/page.tsx` と同じ方針)。
 */
export default async function NewCharacterPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="card">
        <p>
          キャラクターの作成にはログインが必要です。<Link href="/login">ログイン</Link>{" "}
          または <Link href="/register">新規登録</Link>してください。
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>キャラクター作成</h1>
      <CharacterForm mode="create" />
    </div>
  );
}
