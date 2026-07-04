import Link from "next/link";

/**
 * トップページ。
 *
 * `ゲーム画面イメージ/Top画面イメージ.png` を参考にしたヒーローセクション
 * (左右にキャラクターイラスト+中央にタイトル・説明)、3つの主要導線
 * (キャラクター作成・デッキ編成・対戦する)、「ゲームの流れ」3ステップで構成する。
 * 参照画像にある「ランキング」「設定」「お知らせ/遊び方/よくある質問/お問い合わせ」等、
 * このアプリに存在しない機能へのリンクは作らない(Nav.tsx も同様の方針)。
 *
 * `.page-bg`(`ゲーム画面イメージ/Top画面の背景イメージ.png`、
 * `src/app/characters/page.tsx`・`src/app/decks/page.tsx` と共通)がページ全体の
 * 背景としてビューポート幅いっぱいに広がり、ヒーロー〜「ゲームの流れ」セクション
 * までを覆う。各セクション自体は不透明なパネル(`.card`等)なので、背景が
 * 見えるのは余白部分のみ。
 */
export default function Home() {
  return (
    <div className="page-bg">
      <div className="page-bg__content">
        <section className="home-hero">
          <div className="home-hero__character home-hero__character--left" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- 装飾用の静的サンプル画像 */}
            <img src="/characters/sample/zephyr.png" alt="" />
          </div>

          <div className="home-hero__content">
            <h1 className="home-hero__title">
              アルゼリオン
              <br />
              キャラクターカードバトル
            </h1>
            <p className="home-hero__tagline">〜アルゼリオン審判が裁く、閃きと策略の激突〜</p>
            <div className="home-hero__description">
              <p>
                自分だけのキャラクターカードを自由に作り、アルゼリオンが審判となって戦闘の行方を実況する
                オンラインカードゲームです。キャラクター名・画像・説明・パラメーター・必殺技を
                すべて自由に設定でき、8枚のカードでデッキを組んでアルゼリオンが裁く戦闘ログを楽しめます。
              </p>
            </div>
          </div>

          <div className="home-hero__character home-hero__character--right" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- 装飾用の静的サンプル画像 */}
            <img src="/characters/sample/venom.png" alt="" />
          </div>
        </section>

        <section className="home-cta">
          <Link href="/characters" className="home-cta__card home-cta__card--a">
            <svg className="home-cta__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 18c1-2.5 3-3.5 5-3.5s4 1 5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="home-cta__title">キャラクター作成</span>
            <span className="home-cta__subtitle">オリジナルキャラクターを作成する</span>
          </Link>

          <Link href="/decks" className="home-cta__card home-cta__card--b">
            <svg className="home-cta__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2l7 3v6c0 5-3 8-7 11-4-3-7-6-7-11V5l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8.5 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="home-cta__title">デッキ編成</span>
            <span className="home-cta__subtitle">8枚のカードでデッキを組む</span>
          </Link>

          <Link href="/battles" className="home-cta__card home-cta__card--c">
            <svg className="home-cta__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 20L18 6M14 4l4 0 0 4M4 4l6 6M20 20l-4 0 0-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="home-cta__title">対戦する</span>
            <span className="home-cta__subtitle">アルゼリオンが裁く対戦を観戦する</span>
          </Link>
        </section>

        <section className="card home-flow">
          <h2 className="home-flow__heading">ゲームの流れ</h2>
          <div className="home-flow__steps">
            <div className="home-flow__step">
              <svg className="home-flow__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 16.5c0.8-2 2.2-3 4-3s3.2 1 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <h3>1. キャラクターを作る</h3>
              <p>100ポイントを自由なパラメーターに配分し、必殺技を設定してオリジナルキャラクターを作成します。</p>
            </div>
            <div className="home-flow__step">
              <svg className="home-flow__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="6" width="12" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="3" width="12" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <h3>2. デッキを編成する</h3>
              <p>8枚のキャラクターを選び、前衛4枚・控え4枚を指定してデッキを組みます。</p>
            </div>
            <div className="home-flow__step">
              <svg className="home-flow__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20L18 6M14 4l4 0 0 4M4 4l6 6M20 20l-4 0 0-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3>3. 対戦する</h3>
              <p>2つのデッキを選んで対戦を実行すると、アルゼリオンが戦況を分析し戦闘ログと勝敗を生成します。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
