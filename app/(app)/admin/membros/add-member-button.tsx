"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, X, Check, AlertTriangle, Copy } from "lucide-react";

const VALID_ROLES = ["admin", "member", "affiliate"] as const;
type Role = (typeof VALID_ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  affiliate: "Affiliate",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Acesso total — gerencia ofertas, membros, IA, billing",
  member: "Usuário padrão — vê catálogo + favorita",
  affiliate: "Parceiro com tracking de comissão (futuro)",
};

export function AddMemberButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setOpen(false);
    setEmail("");
    setName("");
    setPassword("");
    setRole("member");
    setError(null);
    setSuccess(null);
    setCopied(false);
  }

  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
    setPassword(out);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msgMap: Record<string, string> = {
          email_already_exists: "Esse email já tem conta no sistema.",
          password_too_short: "Senha precisa ter no mínimo 6 caracteres.",
          invalid_email: "Email inválido.",
        };
        setError(msgMap[data.error] ?? data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSuccess({ email: email.trim().toLowerCase(), password });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard() {
    if (!success) return;
    const text = `Email: ${success.email}\nSenha: ${success.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard pode falhar em http */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          inline-flex items-center gap-1.5 px-4 py-2 rounded-full
          bg-[var(--accent)] text-black font-medium text-[12.5px]
          hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
        "
      >
        <UserPlus size={13} strokeWidth={2} />
        Adicionar membro
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) reset();
          }}
        >
          <div className="glass-strong rounded-[var(--r-xl)] p-6 w-full max-w-[480px] flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="display text-[20px] font-semibold tracking-[-0.02em]">
                  {success ? "Membro criado ✓" : "Adicionar membro"}
                </h2>
                <p className="text-[12px] text-text-2 mt-1 leading-relaxed">
                  {success
                    ? "Compartilha essas credenciais com a pessoa. Não vão ser mostradas de novo."
                    : "Cria conta direto sem confirmação de email."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && reset()}
                className="p-1.5 text-text-3 hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            {success ? (
              <div className="flex flex-col gap-4">
                <div
                  className="rounded-[var(--r-md)] p-4 border border-[var(--success)]/30"
                  style={{
                    background: "color-mix(in srgb, var(--success) 10%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-2 text-[var(--success)] text-[13px] font-medium mb-3">
                    <Check size={14} strokeWidth={2.2} />
                    Credenciais
                  </div>
                  <div className="flex flex-col gap-2 mono text-[12px]">
                    <div>
                      <span className="text-text-3">Email: </span>
                      <span className="text-text">{success.email}</span>
                    </div>
                    <div>
                      <span className="text-text-3">Senha: </span>
                      <span className="text-text">{success.password}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="
                      inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                      border border-[var(--border-default)] text-[12px] text-text-2
                      hover:text-text hover:bg-[var(--bg-glass)]
                      transition-colors
                    "
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="
                      px-5 py-2 rounded-full
                      bg-[var(--accent)] text-black font-medium text-[12px]
                      hover:scale-[1.02] transition-transform
                    "
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <Field label="Email" required>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    required
                    autoFocus
                    placeholder="usuario@exemplo.com"
                    className={inputClass}
                  />
                </Field>

                <Field label="Nome (opcional)">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                    maxLength={80}
                    placeholder="Nome de exibição"
                    className={inputClass}
                  />
                </Field>

                <Field label="Senha" required>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      required
                      minLength={6}
                      placeholder="min 6 caracteres"
                      className={`${inputClass} flex-1 mono`}
                    />
                    <button
                      type="button"
                      onClick={generatePassword}
                      disabled={busy}
                      className="
                        shrink-0 px-3 rounded-[var(--r-md)]
                        border border-[var(--border-default)]
                        text-[11px] text-text-2 hover:text-text
                        hover:bg-[var(--bg-glass)]
                        transition-colors disabled:opacity-50
                      "
                    >
                      Gerar
                    </button>
                  </div>
                </Field>

                <Field label="Role">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    disabled={busy}
                    className={inputClass}
                  >
                    {VALID_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10.5px] text-text-3 mt-1.5 leading-relaxed">
                    {ROLE_DESCRIPTIONS[role]}
                  </p>
                </Field>

                {error && (
                  <div
                    className="rounded-[var(--r-md)] px-3 py-2 flex items-start gap-2 text-[12px]"
                    style={{
                      background:
                        "color-mix(in srgb, var(--error) 10%, transparent)",
                      color: "var(--error)",
                    }}
                  >
                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => !busy && reset()}
                    className="px-4 py-2 rounded-full text-[12px] text-text-2 hover:text-text"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !email || password.length < 6}
                    className="
                      inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full
                      bg-[var(--accent)] text-black font-medium text-[12.5px]
                      hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                    "
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} strokeWidth={2.2} />}
                    {busy ? "Criando..." : "Criar membro"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputClass = `
  w-full px-3 py-2.5 rounded-[var(--r-md)]
  bg-black/40 border border-[var(--border-default)]
  text-[13px] text-text placeholder:text-text-3
  focus:outline-none focus:border-[var(--accent)]
  focus:bg-black/60 focus:shadow-[0_0_0_3px_rgba(234,232,226,0.15)]
  transition-[border-color,background] duration-200
  disabled:opacity-60
`;

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1.5">
        {label} {required && <span className="text-[var(--error)]">*</span>}
      </label>
      {children}
    </div>
  );
}
