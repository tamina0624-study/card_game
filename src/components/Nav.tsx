import Link from "next/link";

/**
 * サイト共通ナビゲーション。
 *
 * トップ・キャラクター・デッキ・対戦の各セクションへの導線を提供する。
 * リンク先は docs/設計.md のディレクトリ構成に合わせたパス
 * (/characters, /decks, /battles)とし、各ページ自体は後続タスク
 * (13〜16)で実装する想定(現時点では未実装のため404になり得る)。
 */
export default function Nav() {
  const links: { href: string; label: string }[] = [
    { href: "/", label: "トップ" },
    { href: "/characters", label: "キャラクター" },
    { href: "/decks", label: "デッキ" },
    { href: "/battles", label: "対戦" },
  ];

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="site-logo">
          <span className="site-logo__title">アルゼリオンキャラクターカードバトル</span>
          <span className="site-logo__tagline">〜アルゼリオン審判が裁く、閃きと策略の激突〜</span>
        </Link>
        <nav aria-label="メインナビゲーション">
          <ul className="site-nav">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
