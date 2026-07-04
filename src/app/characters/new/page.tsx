import CharacterForm from "@/components/CharacterForm";

/**
 * キャラクター作成ページ。
 * フォーム本体は `CharacterForm`(`src/app/characters/[id]/edit/page.tsx` と共通)。
 */
export default function NewCharacterPage() {
  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>キャラクター作成</h1>
      <CharacterForm mode="create" />
    </div>
  );
}
