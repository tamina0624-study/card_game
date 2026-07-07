import { notFound } from "next/navigation";
import DeckForm from "@/components/DeckForm";
import { getDeckById } from "@/lib/decks/repository";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * デッキ編集ページ(サーバーコンポーネント)。
 * `lib/decks/repository.ts` を直接呼び出し(`src/app/decks/page.tsx` と同じく
 * hairpin fetchを避ける方針)、既存の前衛/控え構成を `DeckForm`(`mode="edit"`)へ渡す。
 * idが不正、対象が存在しない、または `deck.userId` がログイン中ユーザーと一致しない
 * (＝自分が作成したデッキではない、未ログイン含む)場合は404。存在有無を含めて
 * 他ユーザーのデッキを一切見せない(`src/app/decks/page.tsx` の一覧フィルタと対の対応)。
 */
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDeckPage({ params }: PageProps) {
  const { id: idParam } = await params;
  if (!/^\d+$/.test(idParam)) {
    notFound();
  }
  const [deck, user] = await Promise.all([getDeckById(Number(idParam)), getCurrentUser()]);
  if (!deck || !user || deck.userId !== user.id) {
    notFound();
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>デッキ編集</h1>
      <DeckForm mode="edit" deckId={deck.id} initialDeck={deck} />
    </div>
  );
}
