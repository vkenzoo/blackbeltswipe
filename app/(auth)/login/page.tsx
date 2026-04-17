"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
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
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="glass-strong rounded-[var(--r-xl)] p-10 w-full max-w-[420px] relative z-10 flex flex-col gap-6">
      <Logo size="md" />

      {status === "sent" ? (
        <div className="flex flex-col gap-4 py-4">
          <div className="w-12 h-12 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)]">
            <CheckCircle2 size={24} strokeWidth={1.8} className="text-[var(--success)]" />
          </div>
          <div>
            <h1 className="display text-[22px] font-semibold tracking-[-0.03em] mb-1.5">
              Email enviado.
            </h1>
            <p className="text-[13px] text-text-2 leading-relaxed">
              Te mandamos um link mágico pra{" "}
              <span className="mono text-text">{email}</span>. Clica nele pra entrar — a janela pode ser fechada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="text-[12px] text-text-3 hover:text-text transition-colors self-start mt-2"
          >
            ← Usar outro email
          </button>
        </div>
      ) : (
        <>
          <div>
            <h1 className="display text-[28px] font-semibold tracking-[-0.03em] mb-1.5">
              Bem-vindo.
            </h1>
            <p className="text-[13px] text-text-2">
              Entra pelo magic link no seu email.
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
                disabled={status === "sending"}
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
              disabled={status === "sending" || !email}
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
              {status === "sending" && (
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
              )}
              {status === "sending" ? "Enviando..." : "Enviar link"}
            </button>

            {status === "error" && (
              <div className="text-[12px] text-[var(--error)] mt-1">
                {errorMsg || "Erro ao enviar. Tenta de novo."}
              </div>
            )}
          </form>

          <p className="text-[11px] text-text-3 text-center leading-relaxed">
            Sem senha. Te mandamos um email com um link que te loga na hora.
          </p>
        </>
      )}
    </div>
  );
}
