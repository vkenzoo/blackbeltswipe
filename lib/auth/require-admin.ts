import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard pra Server Components de rotas /admin/*.
 *
 * Defesa em profundidade: o middleware já bloqueia, mas se por algum motivo
 * o middleware for bypass (bug, misconfig, edge case), a página ainda
 * redireciona pra /app se o user não for admin.
 *
 * Uso:
 *   export default async function Page() {
 *     await requireAdmin();
 *     // ... resto do page
 *   }
 */
export async function requireAdmin(): Promise<{
  id: string;
  email: string;
  name: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", user.id)
    .single<{
      id: string;
      email: string;
      name: string | null;
      role: "admin" | "member" | "affiliate";
    }>();

  if (!profile || profile.role !== "admin") {
    redirect("/app");
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
  };
}
