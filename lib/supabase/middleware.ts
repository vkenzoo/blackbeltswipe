import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

/**
 * Refresh da sessão em cada request.
 * Chamado pelo middleware.ts raiz.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Rotas protegidas (precisam login)
  const protectedPaths = ["/app", "/admin"];
  const needsAuth = protectedPaths.some((p) => path.startsWith(p));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Logado com must_change_password=true → força tela de trocar senha.
  // Hub provisiona com essa flag quando cria o user.
  const mustChangePwd = user?.user_metadata?.must_change_password === true;
  const changePwdExempt =
    path.startsWith("/change-password") ||
    path.startsWith("/api") ||
    path.startsWith("/auth");
  if (user && mustChangePwd && !changePwdExempt) {
    const url = request.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  // Rotas de auth (login) — se já logado, manda pro app
  if (path === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  // Rotas admin: checa se user é admin
  if (path.startsWith("/admin") && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<{ role: "admin" | "member" | "affiliate" }>();

    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
