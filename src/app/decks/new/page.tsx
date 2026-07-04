import DeckForm from "@/components/DeckForm";

/**
 * デッキ編成(作成)ページ。
 * フォーム本体は `DeckForm`(`src/app/decks/[id]/edit/page.tsx` と共通)。
 */
export default function NewDeckPage() {
  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>デッキ編成</h1>
      <DeckForm mode="create" />
    </div>
  );
}
