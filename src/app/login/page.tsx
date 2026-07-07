import LoginForm from "@/components/LoginForm";

/** ログインページ。フォーム本体は `LoginForm`(クライアントコンポーネント)。 */
export default function LoginPage() {
  return (
    <div className="auth-page">
      <h1 style={{ marginBottom: "1.5rem" }}>ログイン</h1>
      <LoginForm />
    </div>
  );
}
