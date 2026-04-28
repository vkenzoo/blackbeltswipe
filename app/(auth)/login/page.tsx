"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { logUserEvent } from "@/lib/events/log-event";

export default function LoginPage() {
  return (
    <div
      className="min-h-screen grid place-items-center px-4 py-12 relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.08) 0%, transparent 40%),
          radial-gradient(ellipse at 70% 80%, rgba(255,255,255,0.04) 0%, transparent 45%),
          #070B16
        `,
      }}
    >
      {/* Noise sutil */}
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

      {/* T-mark watermark gigante no fundo (lado direito, só desktop) */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute top-1/2 -translate-y-1/2 pointer-events-none select-none"
        style={{
          right: "-180px",
          width: "720px",
          height: "720px",
          opacity: 0.04,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <path d="M82.147 30.206 V46.11 H68.937 L58.906 30.206 Z" fill="#EAE8E2" />
          <path
            d="M14.735 30.206 V46.11 L33.442 47.034 L38.58 34.957 L35.544 30.206 Z"
            fill="#EAE8E2"
          />
          <path
            d="M67.089 74.223 L78.703 67.03 L55.804 30.206 H39.042 Z"
            fill="#EAE8E2"
          />
          <path
            d="M38.862 78.002 L26.569 69.604 L40.295 37.531 L49.666 51.786 Z"
            fill="#EAE8E2"
          />
        </svg>
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

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const supabase = createClient();

    if (mode === "signin") {
      const res = await supabase.auth.signInWithPassword({ email, password });
      if (res.error) {
        setStatus("error");
        const msg = res.error.message.toLowerCase();
        if (msg.includes("invalid login credentials") || res.error.status === 400) {
          setErrorMsg("Email ou senha inválidos.");
        } else if (msg.includes("email not confirmed")) {
          setErrorMsg("Email ainda não confirmado. Verifica a caixa de entrada.");
        } else {
          setErrorMsg(res.error.message);
        }
        return;
      }
      // Loga evento de sign_in (fire-and-forget, não bloqueia redirect)
      logUserEvent("sign_in", { method: "password" });
      router.push(next);
      router.refresh();
      return;
    }

    // signup mode
    const res = await supabase.auth.signUp({ email, password });
    if (res.error) {
      setStatus("error");
      setErrorMsg(res.error.message);
      return;
    }
    if (res.data.session) {
      // Signup com sessão imediata (email confirmation desativada)
      logUserEvent("sign_up", { method: "password" });
      router.push(next);
      router.refresh();
      return;
    }
    setStatus("error");
    setErrorMsg(
      "Conta criada, mas sessão não gerada. Desativa 'Email Confirmations' no Supabase Auth Settings."
    );
  }

  return (
    <div className="glass-strong rounded-[var(--r-xl)] p-10 w-full max-w-[440px] relative z-10 flex flex-col gap-6">
      <Logo size="md" />

      <div className="flex flex-col gap-2">
        <h1
          className="display"
          style={{
            fontWeight: 300,
            fontSize: "clamp(28px, 4.8vw, 40px)",
            lineHeight: "111%",
            letterSpacing: "-0.025em",
            color: "#EAE8E2",
          }}
        >
          {mode === "signin" ? (
            <>
              Veja tudo que tentaram<br />te esconder.
            </>
          ) : (
            "Criar conta"
          )}
        </h1>
        <p className="text-[13px] text-text-2 mt-1">
          {mode === "signin"
            ? "Entra com seu email e senha."
            : "Preenche pra criar sua conta nova."}
        </p>
      </div>

      {/* Toggle signin/signup */}
      <div
        className="flex items-center gap-0.5 p-[3px] rounded-full border border-[var(--border-hairline)]"
        style={{ background: "rgba(0,0,0,0.3)" }}
      >
        {([
          { key: "signin", label: "Entrar" },
          { key: "signup", label: "Criar conta" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setMode(t.key);
              setErrorMsg("");
              setStatus("idle");
            }}
            disabled={status === "submitting"}
            className={`
              flex-1 py-2 px-3 text-[12px] font-medium rounded-full
              transition-[background,color] duration-200
              ${
                mode === t.key
                  ? "bg-[var(--bg-elevated)] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-text-3 hover:text-text-2"
              }
            `}
            aria-pressed={mode === t.key}
          >
            {t.label}
          </button>
        ))}
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
          {status === "submitting"
            ? mode === "signin"
              ? "Entrando..."
              : "Criando..."
            : mode === "signin"
            ? "Entrar"
            : "Criar conta"}
        </button>

        {status === "error" && (
          <div className="text-[12px] text-[var(--error)] mt-1">
            {errorMsg || "Erro ao entrar. Tenta de novo."}
          </div>
        )}
      </form>

      <p className="text-[11px] text-text-3 text-center leading-relaxed">
        {mode === "signin"
          ? "Sem conta? Clica em \"Criar conta\" acima."
          : "Primeiro usuário vira admin automaticamente."}
      </p>
    </div>
  );
}
