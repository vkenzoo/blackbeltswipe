"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Check, AlertTriangle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "member" | "affiliate";
  created_at: string;
};

const ROLE_LABELS: Record<Profile["role"], string> = {
  admin: "Admin",
  member: "Member",
  affiliate: "Affiliate",
};

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const initial = (profile.name ?? profile.email).charAt(0).toUpperCase();
  const dirty = (name.trim() || null) !== (profile.name ?? null);

  function showMsg(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  }

  async function saveName() {
    if (savingName || !dirty) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showMsg("err", d.error ?? `HTTP ${res.status}`);
        return;
      }
      showMsg("ok", "Nome atualizado");
      router.refresh();
    } catch (err) {
      showMsg("err", err instanceof Error ? err.message : "erro");
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarPick(file: File) {
    if (uploadingAvatar) return;
    if (file.size > 2 * 1024 * 1024) {
      showMsg("err", "Arquivo > 2MB. Reduz a imagem antes.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showMsg("err", "Tipo inválido. Usa JPG, PNG ou WEBP.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: true,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar_url: publicUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showMsg("err", d.error ?? `HTTP ${res.status}`);
        return;
      }
      setAvatarUrl(publicUrl);
      showMsg("ok", "Foto atualizada");
      router.refresh();
    } catch (err) {
      showMsg("err", err instanceof Error ? err.message : "erro upload");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (uploadingAvatar) return;
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar_url: null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showMsg("err", d.error ?? `HTTP ${res.status}`);
        return;
      }
      setAvatarUrl(null);
      showMsg("ok", "Foto removida");
      router.refresh();
    } catch (err) {
      showMsg("err", err instanceof Error ? err.message : "erro");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Avatar + email card */}
      <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-5">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="relative shrink-0">
            <div
              className="w-20 h-20 rounded-full overflow-hidden grid place-items-center border border-[var(--border-default)] bg-[var(--bg-elevated)]"
              style={{ background: avatarUrl ? undefined : "linear-gradient(135deg, #EAE8E2 0%, #B0AEA8 100%)" }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-display font-bold text-[28px] text-black">
                  {initial}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="
                absolute -bottom-1 -right-1 w-8 h-8 rounded-full grid place-items-center
                bg-[var(--accent)] text-black border-2 border-[var(--bg-surface)]
                hover:scale-105 transition-transform duration-200
                disabled:opacity-60
              "
              aria-label="Trocar foto"
            >
              {uploadingAvatar ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Camera size={13} strokeWidth={2} />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarPick(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="text-[15px] font-medium text-text truncate">
              {name.trim() || profile.email.split("@")[0]}
            </div>
            <div className="text-[12px] text-text-3 mono truncate">{profile.email}</div>
            <div className="text-[10px] text-text-3 uppercase tracking-[0.14em] mt-1">
              {ROLE_LABELS[profile.role]} · membro desde{" "}
              {new Date(profile.created_at).toLocaleDateString("pt-BR")}
            </div>
            {avatarUrl && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={uploadingAvatar}
                className="self-start mt-2 text-[11px] text-text-3 hover:text-[var(--error)] transition-colors disabled:opacity-50"
              >
                Remover foto
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Nome */}
      <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-4">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
            Nome de exibição
          </div>
          <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
            Como apareces no sistema
          </h2>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Seu nome"
          className="
            w-full px-4 py-3 rounded-[var(--r-md)]
            bg-black/40 border border-[var(--border-default)]
            text-[14px] text-text placeholder:text-text-3
            focus:outline-none focus:border-[var(--accent)]
            focus:bg-black/60 focus:shadow-[0_0_0_3px_rgba(234,232,226,0.15)]
            transition-[border-color,background] duration-200
          "
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-text-3 mono">
            {name.length}/80
          </span>
          <button
            type="button"
            onClick={saveName}
            disabled={!dirty || savingName}
            className="
              inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full
              bg-[var(--accent)] text-black font-medium text-[13px]
              hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
            "
          >
            {savingName ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} strokeWidth={2.5} />
            )}
            {savingName ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </section>

      {/* Sair */}
      <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-text">Sair da conta</div>
          <div className="text-[11px] text-text-3 mt-0.5">
            Encerra a sessão deste navegador.
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="
            inline-flex items-center gap-1.5 px-4 py-2 rounded-full
            border border-[var(--border-default)] text-[12px] text-text-2
            hover:text-[var(--error)] hover:border-[var(--error)]
            transition-colors disabled:opacity-50
          "
        >
          {signingOut ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <LogOut size={12} strokeWidth={1.8} />
          )}
          Sair
        </button>
      </section>

      {/* Message toast */}
      {msg && (
        <div
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50
            px-4 py-2.5 rounded-full text-[12.5px] font-medium
            flex items-center gap-2
            ${
              msg.kind === "ok"
                ? "bg-[color-mix(in_srgb,var(--success)_18%,black)] text-[var(--success)]"
                : "bg-[color-mix(in_srgb,var(--error)_18%,black)] text-[var(--error)]"
            }
          `}
        >
          {msg.kind === "ok" ? (
            <Check size={13} strokeWidth={2.5} />
          ) : (
            <AlertTriangle size={13} strokeWidth={2} />
          )}
          {msg.text}
        </div>
      )}
    </div>
  );
}
