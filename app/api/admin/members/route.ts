import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

const VALID_ROLES = ["admin", "member", "affiliate"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * POST /api/admin/members
 *
 * Body: { email, password, name?, role? }
 *
 * Cria um novo usuário direto via Supabase Admin API (sem confirmação de
 * email). Usado pelo admin pra adicionar membros já que signup público
 * foi removido. O trigger handle_new_user cuida do INSERT em profiles,
 * mas como ele só faz INSERT inicial, fazemos UPDATE depois pra setar
 * name + role.
 *
 * Default role: 'member'.
 */
export async function POST(req: Request) {
  // Auth check (admin only)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const roleInput = typeof body.role === "string" ? body.role : "member";
  const role: Role = (VALID_ROLES as readonly string[]).includes(roleInput)
    ? (roleInput as Role)
    : "member";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "password_too_short", min: 6 },
      { status: 400 }
    );
  }

  // Service role client pra usar admin API
  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1. Cria user via admin API (sem email confirmation)
  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip confirmation
    });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? "create_failed";
    // Email já existe? Returna 409
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
      return NextResponse.json(
        { error: "email_already_exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 2. Trigger handle_new_user cria row em profiles com role=member.
  //    Update pra ajustar name + role se necessário.
  const patch: Record<string, unknown> = { role };
  if (name) patch.name = name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (service.from("profiles") as any)
    .update(patch)
    .eq("id", created.user.id);
  if (updErr) {
    // Rollback: deleta o user se profile update falhou
    await service.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: created.user.id,
        email: created.user.email,
        name: name || null,
        role,
      },
    },
    { status: 201 }
  );
}
