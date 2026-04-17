"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <div
      className="min-h-screen grid place-items-center px-4 relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.10) 0%, transparent 40%),
          radial-gradient(ellipse at 70% 80%, rgba(255,255,255,0.05) 0%, transparent 45%),
          #000000
        `,
      }}
    >
      <div className="absolute inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>\")",
            opacity: 0.02,
            mixBlendMode: "overlay",
          }}
        />
      </div>

      <Suspense fallback={<LoginCardSkeleton />}>
        <LoginCard />
      </Suspense>
    </div>
  );
}

function LoginCardSkeleton() {
  return (
    <div className="glass-strong rounded-[var(--r-xl)] p-10 w-full max-w-[420px] relative z-10 flex flex-col gap-6">
      <div className="h-8 skeleton rounded-md" />
      <div className="h-6 skeleton rounded-md w-2/3" />
      <div className="h-12 skeleton rounded-md" />
      <div className="h-12 skeleton rounded-md" />
    </div>
  );
}

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const supabase = createClient();

    // 1. Tenta sign in
    const signIn = await supabase.auth.signInWithPassword({ email, password });

    if (!signIn.error) {
      router.push(next);
      router.refresh();
      return;
    }

    // 2. Se user não existe, cria (signup)
    const isMissingUser =
      signIn.error.message.toLowerCase().includes("invalid login credentials") ||
      signIn.error.status === 400;

    if (isMissingUser) {
      const signUp = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUp.error) {
        setStatus("error");
        setErrorMsg(signUp.error.message);
        return;
      }

      // se session foi criada (confirm email off): já logou
      if (signUp.data.session) {
        router.push(next);
        router.refresh();
        return;
      }

      setStatus("error");
      setErrorMsg("Conta criada mas sessão não gerada. Ativa 'Disable email confirmations' no Supabase.");
      return;
    }

    // outro erro
    setStatus("error");
    setErrorMsg(signIn.error.message);
  }

  return (
    <div className="glass-strong rounded-[var(--r-xl)] p-10 w-full max-w-[420px] relative z-10 flex flex-col gap-6">
      <Logo size="md" />

      <div>
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em] mb-1.5">
          Bem-vindo.
        </h1>
        <p className="text-[13px] text-text-2">
          Entra com seu email e senha. Se for novo por aqui, a conta é criada automaticamente.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <Mail
            size={15}
            strokeWidth={1.8}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <input
            type="email"
            name="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "submitting"}
            className="
              w-full pl-11 pr-4 py-3.5 rounded-[var(--r-md)]
              bg-black/30 border border-[var(--border-default)]
              text-[14px] text-text placeholder:text-text-3
              transition-[border-color,background,box-shadow] duration-200
              focus:outline-none focus:border-[var(--accent)]
              focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
              disabled:opacity-60
            "
          />
        </div>

        <div className="relative">
          <Lock
            size={15}
            strokeWidth={1.8}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="current-password"
            placeholder="senha (mín 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={status === "submitting"}
            className="
              w-full pl-11 pr-4 py-3.5 rounded-[var(--r-md)]
              bg-black/30 border border-[var(--border-default)]
              text-[14px] text-text placeholder:text-text-3
              transition-[border-color,background,box-shadow] duration-200
              focus:outline-none focus:border-[var(--accent)]
              focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
              disabled:opacity-60
            "
          />
        </div>

        <button
          type="submit"
          disabled={status === "submitting" || !email || !password}
          className="
            w-full py-3.5 mt-1 rounded-[var(--r-md)]
            bg-[var(--accent)] text-black font-semibold text-[14px]
            transition-[transform,background,opacity] duration-200 ease-[var(--ease-spring)]
            hover:scale-[1.01] hover:bg-white
            active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
            tracking-[-0.01em]
            inline-flex items-center justify-center gap-2
          "
        >
          {status === "submitting" && (
            <Loader2 size={15} strokeWidth={2} className="animate-spin" />
          )}
          {status === "submitting" ? "Entrando..." : "Entrar"}
        </button>

        {status === "error" && (
          <div className="text-[12px] text-[var(--error)] mt-1">
            {errorMsg || "Erro ao entrar. Tenta de novo."}
          </div>
        )}
      </form>

      <p className="text-[11px] text-text-3 text-center leading-relaxed">
        Primeiro usuário a entrar vira admin automaticamente.
      </p>
    </div>
  );
}
