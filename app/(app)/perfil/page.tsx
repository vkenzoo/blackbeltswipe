import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/perfil");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, name, avatar_url, role, created_at")
    .eq("id", user.id)
    .single<{
      id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
      role: "admin" | "member" | "affiliate";
      created_at: string;
    }>();

  if (!profile) redirect("/login");

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[720px] mx-auto">
      <header className="flex flex-col gap-1">
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
          Conta
        </div>
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Perfil
        </h1>
        <p className="text-[13px] text-text-2 mt-1">
          Atualiza teu nome e foto. O email e papel são gerenciados pelo admin.
        </p>
      </header>

      <ProfileEditor profile={profile} />
    </div>
  );
}
