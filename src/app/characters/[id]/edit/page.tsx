import { notFound } from "next/navigation";
import CharacterForm from "@/components/CharacterForm";
import { getCharacterById } from "@/lib/characters/repository";

/**
 * キャラクター編集ページ(サーバーコンポーネント)。
 * `lib/characters/repository.ts` を直接呼び出し(`src/app/characters/page.tsx` と
 * 同じくhairpin fetchを避ける方針)、既存の値を `CharacterForm`(`mode="edit"`)へ渡す。
 * idが不正、または対象が存在しない場合は404。
 */
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCharacterPage({ params }: PageProps) {
  const { id: idParam } = await params;
  if (!/^\d+$/.test(idParam)) {
    notFound();
  }
  const character = await getCharacterById(Number(idParam));
  if (!character) {
    notFound();
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>キャラクター編集</h1>
      <CharacterForm mode="edit" characterId={character.id} initialCharacter={character} />
    </div>
  );
}
