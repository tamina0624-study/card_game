import { notFound } from "next/navigation";
import DeckForm from "@/components/DeckForm";
import { getDeckById } from "@/lib/decks/repository";

/**
 * デッキ編集ページ(サーバーコンポーネント)。
 * `lib/decks/repository.ts` を直接呼び出し(`src/app/decks/page.tsx` と同じく
 * hairpin fetchを避ける方針)、既存の前衛/控え構成を `DeckForm`(`mode="edit"`)へ渡す。
 * idが不正、または対象が存在しない場合は404。
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
  const deck = await getDeckById(Number(idParam));
  if (!deck) {
    notFound();
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>デッキ編集</h1>
      <DeckForm mode="edit" deckId={deck.id} initialDeck={deck} />
    </div>
  );
}
