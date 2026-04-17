"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check } from "lucide-react";
import { useState } from "react";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
} from "@/lib/types";

const inputStyle = `
  w-full px-3.5 py-2.5 rounded-[var(--r-md)]
  bg-black/30 border border-[var(--border-default)]
  text-[14px] text-text placeholder:text-text-3
  transition-[border-color,background] duration-200
  focus:outline-none focus:border-[var(--accent)]
  focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
`;

const labelStyle = "block text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-2";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewOfferPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    // eslint-disable-next-line no-console
    console.log("Nova oferta (mock):", data);
    alert("Oferta criada (mock). Ver console.");
    router.push("/admin/offers");
  }

  return (
    <div className="relative z-10 px-8 py-8 flex flex-col gap-8 max-w-[720px] mx-auto">
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar pras ofertas
      </Link>

      <div>
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
          Admin · Nova oferta
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.035em] leading-tight">
          Adicionar oferta
        </h1>
        <p className="text-[13px] text-text-2 mt-2">
          Quando salvar, o worker vai abrir as URLs e gerar screenshots + extrair ad count.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className={labelStyle} htmlFor="title">Título</label>
          <input
            id="title"
            name="title"
            className={inputStyle}
            placeholder="Ex: Lacuna da Loteria"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSlug(slugify(e.target.value));
            }}
            required
          />
        </div>

        <div>
          <label className={labelStyle} htmlFor="slug">Slug</label>
          <input
            id="slug"
            name="slug"
            className={`${inputStyle} mono`}
            placeholder="lacuna-da-loteria"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <p className="text-[11px] text-text-3 mt-1.5">
            URL final: /app/{slug || "slug-da-oferta"}
          </p>
        </div>

        <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
          <div>
            <label className={labelStyle} htmlFor="niche">Nicho</label>
            <select id="niche" name="niche" className={inputStyle} required>
              {Object.entries(NICHE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle} htmlFor="structure">Estrutura</label>
            <select id="structure" name="structure" className={inputStyle} required>
              {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle} htmlFor="language">Idioma</label>
            <select id="language" name="language" className={inputStyle} required>
              {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.flag} {v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle} htmlFor="traffic_source">Tráfego</label>
            <select id="traffic_source" name="traffic_source" className={inputStyle} required>
              {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelStyle}>Status</label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <label
                key={k}
                className="
                  inline-flex items-center gap-2 px-4 py-2 rounded-full
                  glass-light cursor-pointer
                  text-[13px] font-medium
                  has-[:checked]:bg-[var(--bg-elevated)] has-[:checked]:border-[var(--border-strong)]
                  transition-all duration-200
                "
              >
                <input
                  type="radio"
                  name="status"
                  value={k}
                  defaultChecked={k === "draft"}
                  className="sr-only peer"
                />
                <span className="w-3 h-3 rounded-full border border-[var(--border-strong)] peer-checked:bg-[var(--accent)] peer-checked:border-[var(--accent)] transition-colors" />
                {v}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelStyle} htmlFor="vsl_url">URL da VSL</label>
          <input
            id="vsl_url"
            name="vsl_url"
            type="url"
            className={`${inputStyle} mono`}
            placeholder="https://exemplo.com/vsl"
          />
        </div>

        <div>
          <label className={labelStyle} htmlFor="urls">URLs pra enriquecer (uma por linha)</label>
          <textarea
            id="urls"
            name="urls"
            rows={4}
            className={`${inputStyle} mono resize-none`}
            placeholder={`https://facebook.com/ads/library/?q=...\nhttps://facebook.com/pagina\nhttps://landing.com.br`}
          />
          <p className="text-[11px] text-text-3 mt-1.5">
            Ad Library · FB Page · Site Principal · Checkout
          </p>
        </div>

        <div>
          <label className={labelStyle} htmlFor="flags">Flags (opcional, separadas por vírgula)</label>
          <input
            id="flags"
            name="flags"
            className={inputStyle}
            placeholder="escalando, novo, hot"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-hairline)]">
          <Link
            href="/admin/offers"
            className="
              px-4 py-2.5 rounded-full
              text-[13px] font-medium text-text-2 hover:text-text
              hover:bg-[var(--bg-glass)]
              transition-colors duration-200
            "
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-full
              bg-[var(--accent)] text-black font-medium text-[13px]
              shadow-[0_4px_20px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.4)]
              transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.02] hover:-translate-y-[1px]
              active:scale-[0.97]
            "
          >
            <Check size={15} strokeWidth={2} />
            Criar oferta
          </button>
        </div>
      </form>
    </div>
  );
}
