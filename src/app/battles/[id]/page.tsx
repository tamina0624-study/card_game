import Link from "next/link";
import { notFound } from "next/navigation";
import BattleLogViewer from "@/components/BattleLogViewer";
import { getBattleDetail } from "@/lib/battles/repository";
import { getDeckById } from "@/lib/decks/repository";
import type { BattleDetail, Character } from "@/lib/types";

/**
 * 対戦詳細(バトルログ表示)ページ(サーバーコンポーネント)。
 *
 * `lib/battles/repository.ts` の `getBattleDetail(id)` を直接呼び出し、
 * 対戦カード(デッキA vs デッキB名)・戦闘前分析(`analysis.teamA`/`teamB`/
 * `predictedWinner`)・戦闘ログ(`BattleLogViewer`、ターン送りUI)・
 * 最終結果バナー(`winner`をデッキ名にマッピング+`mvpName`)を表示する
 * (`src/app/battles/page.tsx`・`src/app/decks/page.tsx` と同じ方針)。
 *
 * `status === 'failed'` の場合は `errorMessage` をエラーバナーとして表示し、
 * `status === 'pending' | 'running'` のまま(`docs/設計.md` 0章-4により
 * `POST /api/battles` は同期APIのため通常は発生しない想定だが、念のため)の
 * 場合は「処理中」の案内を表示する。
 */

/** idが数値でない場合、または対戦が存在しない場合は `null` を返す。 */
async function fetchBattle(id: string) {
  if (!/^\d+$/.test(id)) {
    return null;
  }
  return getBattleDetail(Number(id));
}

/** デッキの前衛+控え(計8体)を、ロースター表示・行動/戦闘不能演出の名前照合に使う配列として取得する。 */
async function fetchRoster(deckId: number): Promise<Character[]> {
  const deck = await getDeckById(deckId);
  if (!deck) {
    return [];
  }
  return [...deck.front, ...deck.bench];
}

/** SQLiteの `datetime('now')` 形式("YYYY-MM-DD HH:MM:SS"、UTC)を日本語表記に整形する。 */
function formatDateTime(value: string): string {
  const isoLike = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABELS: Record<BattleDetail["status"], string> = {
  pending: "準備中",
  running: "対戦中",
  completed: "完了",
  failed: "失敗",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BattleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const battle = await fetchBattle(id);

  if (!battle) {
    notFound();
  }

  const rosterA = await fetchRoster(battle.deckA.id);
  const rosterB = await fetchRoster(battle.deckB.id);

  /** `'teamA' | 'teamB'` をそのチームが使用しているデッキ名に変換する。 */
  const teamName = (team: "teamA" | "teamB"): string =>
    team === "teamA" ? battle.deckA.name : battle.deckB.name;

  return (
    <div>
      <div className="page-header">
        <h1>
          {battle.deckA.name}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}> vs </span>
          {battle.deckB.name}
        </h1>
        <Link href="/battles" className="button button-secondary">
          対戦一覧に戻る
        </Link>
      </div>

      <p className="battle-detail__meta">
        実行日時: {formatDateTime(battle.createdAt)} ・ ステータス:{" "}
        <span className="badge">{STATUS_LABELS[battle.status]}</span>
      </p>

      {battle.status === "failed" && (
        <div className="form-error-banner" role="alert">
          対戦の実行に失敗しました: {battle.errorMessage ?? "詳細不明のエラーが発生しました。"}
        </div>
      )}

      {(battle.status === "pending" || battle.status === "running") && (
        <div className="card battle-detail__pending" role="status">
          <p>
            この対戦はまだ処理中です。しばらく経ってからページを再読み込みしてください
            (通常、対戦はAPI呼び出し完了時点で結果が確定するため、この状態が長時間続く場合は
            処理に問題が発生している可能性があります)。
          </p>
        </div>
      )}

      {battle.analysis && (
        <section className="card battle-detail__analysis">
          <h2>戦闘前分析</h2>
          <div className="battle-detail__analysis-teams">
            <div className="battle-detail__analysis-team battle-detail__analysis-team--a">
              <h3>{battle.deckA.name}</h3>
              <p>{battle.analysis.teamA}</p>
            </div>
            <div className="battle-detail__analysis-team battle-detail__analysis-team--b">
              <h3>{battle.deckB.name}</h3>
              <p>{battle.analysis.teamB}</p>
            </div>
          </div>
          <p className="battle-detail__predicted-winner">
            事前予想: <strong>{teamName(battle.analysis.predictedWinner)}</strong> が優勢
          </p>
        </section>
      )}

      <section className="card battle-detail__log-section">
        <h2 style={{ marginBottom: "1rem" }}>戦闘ログ</h2>
        <BattleLogViewer
          entries={battle.battleLog}
          events={battle.events}
          rosterA={rosterA}
          rosterB={rosterB}
        />
      </section>

      {battle.result && (
        <section className="battle-result-banner">
          <p className="battle-result-banner__label">最終結果</p>
          <p className="battle-result-banner__winner">
            {teamName(battle.result.winner)} の勝利!
          </p>
          <p className="battle-result-banner__mvp">MVP: {battle.result.mvpName}</p>
        </section>
      )}
    </div>
  );
}
