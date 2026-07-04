import Link from "next/link";
import DeleteButton from "@/components/DeleteButton";
import { listCharacters, toCharacterSummary } from "@/lib/characters/repository";

/**
 * キャラクター一覧ページ(サーバーコンポーネント)。
 *
 * `lib/characters/repository.ts` を直接呼び出し、常に最新の一覧を表示する
 * (`GET /api/characters` と同一プロセス内のため、自分自身のAPIをHTTP経由で
 * fetchし直す必要はない)。DB直接呼び出しのみだとNext.jsが静的prerenderして
 * しまう(ビルド時点のデータで固定される)ため `force-dynamic` を明示する。
 *
 * 背景は `.page-bg`(`src/app/page.tsx`・`src/app/decks/page.tsx` と共通、
 * `ゲーム画面イメージ/Top画面の背景イメージ.png`)。
 */
export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const characters = listCharacters().map(toCharacterSummary);

  return (
    <div className="page-bg">
      <div className="page-bg__content">
        <div className="page-header">
          <h1>キャラクター一覧</h1>
          <Link href="/characters/new" className="button button-primary">
            + 新しいキャラクターを作成
          </Link>
        </div>

        {characters.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            まだキャラクターが登録されていません。「新しいキャラクターを作成」から最初の1体を作りましょう。
          </p>
        ) : (
          <div className="character-grid">
            {characters.map((character) => (
              <div key={character.id} className="card character-card">
                <div className="character-card__thumb">
                  {character.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ローカルアップロード画像をそのまま表示するため
                    <img src={character.imageUrl} alt={character.name} />
                  ) : (
                    <div className="character-card__thumb-placeholder">No Image</div>
                  )}
                </div>
                <h2 className="character-card__name">{character.name}</h2>
                {character.description && (
                  <p className="character-card__desc">{character.description}</p>
                )}
                <div className="character-card__stats">
                  <span className="badge">合計 {character.totalPoints}pt</span>
                  <span className="badge">必殺技 {character.specialMoveCount}個</span>
                </div>
                <div className="card-actions">
                  <Link href={`/characters/${character.id}/edit`} className="button button-secondary">
                    編集
                  </Link>
                  <DeleteButton
                    endpoint={`/api/characters/${character.id}`}
                    confirmMessage={`「${character.name}」を削除しますか?この操作は取り消せません。`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
