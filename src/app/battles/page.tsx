import BattleSetupForm from "@/components/BattleSetupForm";
import { listBattles } from "@/lib/battles/repository";

/**
 * 対戦ページ(サーバーコンポーネント)。
 *
 * `lib/battles/repository.ts` の `listBattles()` を直接呼び出し、対戦履歴を
 * `BattleSetupForm`(クライアントコンポーネント)へ渡す。対戦セットアップ
 * (デッキ選択+「対戦開始」)・対戦履歴一覧のどちらも `BattleSetupForm` 側で
 * まとめて描画する(履歴の各行をクリックした際に、同じポップアップ
 * (`戦闘エリア`/`実況エリア`)でその対戦を再生できるようにするため、
 * 履歴一覧もクライアント側の状態と同じコンポーネントに置く必要がある)。
 */
export const dynamic = "force-dynamic";

export default async function BattlesPage() {
  const battles = listBattles();
  // 新しい対戦が上に来るよう、id降順(実行順の逆順)で表示する。
  const sortedBattles = [...battles].sort((a, b) => b.id - a.id);

  return (
    <div>
      <div className="page-header">
        <h1>対戦</h1>
      </div>

      <BattleSetupForm battles={sortedBattles} />
    </div>
  );
}
