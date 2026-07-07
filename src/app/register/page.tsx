import RegisterForm from "@/components/RegisterForm";

/** ユーザー登録ページ。フォーム本体は `RegisterForm`(クライアントコンポーネント)。 */
export default function RegisterPage() {
  return (
    <div className="auth-page">
      <h1 style={{ marginBottom: "1.5rem" }}>新規登録</h1>
      <RegisterForm />
    </div>
  );
}
