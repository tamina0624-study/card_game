import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * サイト共通ナビゲーション(サーバーコンポーネント)。
 *
 * トップ・キャラクター・デッキ・対戦・ストーリーの各セクションへの導線を提供する。
 * `getCurrentUser()`(`lib/auth/session.ts`、Cookieのセッショントークンを
 * PHPブリッジで検証する)を都度呼び出し、ログイン中はユーザー名+ログアウトボタン、
 * 未ログインはログイン/新規登録リンクを出し分ける。
 */
export default async function Nav() {
  const user = await getCurrentUser();

  const links: { href: string; label: string }[] = [
    { href: "/", label: "トップ" },
    { href: "/characters", label: "キャラクター" },
    { href: "/decks", label: "デッキ" },
    { href: "/battles", label: "対戦" },
    { href: "/stories", label: "ストーリー" },
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
        <div className="site-header__auth">
          {user ? (
            <>
              <span className="site-header__username">{user.username} さん</span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="button button-secondary">
                ログイン
              </Link>
              <Link href="/register" className="button button-primary">
                新規登録
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
