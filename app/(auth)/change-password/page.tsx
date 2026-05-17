"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
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
      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    if (next.length < 10) {
      setStatus("error");
      setErrorMsg("Nova senha precisa ter ao menos 10 caracteres");
      return;
    }
    if (next !== confirm) {
      setStatus("error");
      setErrorMsg("As senhas não conferem");
      return;
    }
    if (next === current) {
      setStatus("error");
      setErrorMsg("Use uma senha diferente da atual");
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setStatus("error");
      setErrorMsg("Sessão expirada. Faça login novamente.");
      return;
    }

    // Valida senha atual
    const reAuth = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (reAuth.error) {
      setStatus("error");
      setErrorMsg("Senha atual incorreta");
      return;
    }

    // Atualiza senha + limpa flag
    const { error } = await supabase.auth.updateUser({
      password: next,
      data: {
        ...user.user_metadata,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <div className="glass-strong rounded-[var(--r-xl)] p-10 w-full max-w-[420px] relative z-10 flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <Logo />
        <h1 className="text-2xl font-semibold">Crie sua nova senha</h1>
        <p className="text-sm text-white/60 text-center">
          No primeiro acesso, troque a senha temporária por uma sua.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Senha atual"
          icon={<Lock size={16} />}
          type="password"
          value={current}
          onChange={setCurrent}
          placeholder="A senha que veio por email"
          autoComplete="current-password"
        />
        <Field
          label="Nova senha"
          icon={<Lock size={16} />}
          type="password"
          value={next}
          onChange={setNext}
          placeholder="Mínimo 10 caracteres"
          autoComplete="new-password"
        />
        <Field
          label="Confirmar nova senha"
          icon={<Lock size={16} />}
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />

        {errorMsg && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-12 rounded-md bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {status === "submitting" ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Salvando...
            </>
          ) : (
            "Trocar senha"
          )}
        </button>
      </form>

      <p className="text-xs text-white/40 text-center">
        Sua senha é privada. Ninguém da equipe BLACKBELT consegue ver.
      </p>
    </div>
  );
}

function Field({
  label,
  icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-white/50">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 h-11 focus-within:border-white/30 transition">
        <span className="text-white/40">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          minLength={type === "password" ? 10 : undefined}
          className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-sm"
        />
      </div>
    </label>
  );
}
