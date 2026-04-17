import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware já garante, mas defesa em profundidade
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, name, role")
    .eq("id", user.id)
    .single<{ email: string; name: string | null; role: "admin" | "member" | "affiliate" }>();

  return (
    <AppShell
      user={{
        email: profile?.email ?? user.email ?? "",
        name: profile?.name ?? null,
        role: profile?.role ?? "member",
      }}
    >
      {children}
    </AppShell>
  );
}
