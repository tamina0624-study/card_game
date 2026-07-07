import { notFound } from "next/navigation";
import CharacterForm from "@/components/CharacterForm";
import { getCharacterById } from "@/lib/characters/repository";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * キャラクター編集ページ(サーバーコンポーネント)。
 * `lib/characters/repository.ts` を直接呼び出し(`src/app/characters/page.tsx` と
 * 同じくhairpin fetchを避ける方針)、既存の値を `CharacterForm`(`mode="edit"`)へ渡す。
 * idが不正、対象が存在しない場合は404。システムキャラクターは誰でも閲覧できる
 * (`CharacterForm` 側で編集不可の通知を表示、既存挙動のまま)が、非システム
 * キャラクターは作成者(ログイン中ユーザー)以外には404にし、他ユーザーが作成した
 * キャラクターを一切見せない(`src/app/decks/[id]/edit/page.tsx` と対の対応)。
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
  const [character, user] = await Promise.all([
    getCharacterById(Number(idParam)),
    getCurrentUser(),
  ]);
  if (!character) {
    notFound();
  }
  if (!character.isSystem && (!user || character.userId !== user.id)) {
    notFound();
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>キャラクター編集</h1>
      <CharacterForm mode="edit" characterId={character.id} initialCharacter={character} />
    </div>
  );
}
