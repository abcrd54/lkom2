import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { PageShell } from "@/components/page-shell";
import { getAdminSessionUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getAdminSessionUser();

  if (user) {
    redirect("/");
  }

  return (
    <PageShell>
      <section className="panel panel-pad" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="stack">
          <div>
            <p className="eyebrow">Admin Access</p>
            <h1 className="section-title">Login with Supabase Auth.</h1>
            <p className="section-copy">
              Buat admin user langsung dari Supabase Auth. Setelah itu dashboard admin dan endpoint
              admin akan mengikuti session Supabase.
            </p>
          </div>
          <LoginForm />
        </div>
      </section>
    </PageShell>
  );
}
