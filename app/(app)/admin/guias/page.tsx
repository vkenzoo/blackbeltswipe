import Link from "next/link";
import {
  BookOpen,
  Activity,
  Rocket,
  ChevronRight,
  Sparkles,
  Clock,
  Target,
  Wrench,
  DollarSign,
  ShieldCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";

// Índice de guias — conteúdo estático. Next cacheia normalmente.

/**
 * /admin/guias
 *
 * Hub de guias pra admins. Cada card abre um guia detalhado sobre
 * um aspecto do sistema. Extensível — basta adicionar entradas no array
 * GUIDES e criar a página correspondente.
 */

type Guide = {
  slug: string;
  emoji: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  tags: string[];
  estimated_read: string;
  updated_at?: string;
};

const GUIDES: Guide[] = [
  {
    slug: "cadastrar-oferta",
    emoji: "🎯",
    icon: <Target size={18} strokeWidth={1.8} />,
    color: "#EC4899",
    title: "Cadastrar uma oferta do zero",
    description:
      "Fluxo completo: from-URL (recomendado), batch, manual. Como o worker processa, review da AI Suggest, checklist de publicação e quando rodar re-enrich.",
    tags: ["início", "fluxo", "publicação"],
    estimated_read: "10min",
    updated_at: "2026-04-20",
  },
  {
    slug: "aprovacoes",
    emoji: "✅",
    icon: <ShieldCheck size={18} strokeWidth={1.8} />,
    color: "var(--success)",
    title: "Sistema de Aprovações",
    description:
      "Os 2 tipos de aprovação (Pages + AI drafts), por que existem, workflow rápido de revisão, como reverter decisões erradas, e como desligar temporariamente.",
    tags: ["aprovação", "segurança", "workflow"],
    estimated_read: "12min",
    updated_at: "2026-04-20",
  },
  {
    slug: "workers",
    emoji: "⚙️",
    icon: <Activity size={18} strokeWidth={1.8} />,
    color: "#8B5CF6",
    title: "Workers e Automação",
    description:
      "Entenda os 10 workers que rodam 24/7 em background: o que cada um faz, quando dispara, quanto custa e como saber se tá funcionando.",
    tags: ["automação", "IA", "custos"],
    estimated_read: "10min",
    updated_at: "2026-04-20",
  },
  {
    slug: "meta-api",
    emoji: "📡",
    icon: <Rocket size={18} strokeWidth={1.8} />,
    color: "#06B6D4",
    title: "Meta Ad Library API",
    description:
      "Como conectar com a API oficial do Meta, a diferença entre token curto/long-lived/system user, troubleshooting de token expirado, rate limits, e como monitorar.",
    tags: ["API", "Meta", "token", "configuração"],
    estimated_read: "12min",
    updated_at: "2026-04-20",
  },
  {
    slug: "troubleshooting",
    emoji: "🔧",
    icon: <Wrench size={18} strokeWidth={1.8} />,
    color: "#F59E0B",
    title: "Troubleshooting geral",
    description:
      "Os problemas mais frequentes (worker parado, token expirado, ofertas sem thumb, criativos errados, AI Suggest quieta) com causa + ação direta pra resolver.",
    tags: ["debug", "problemas", "fix"],
    estimated_read: "12min",
    updated_at: "2026-04-20",
  },
  {
    slug: "custos",
    emoji: "💰",
    icon: <DollarSign size={18} strokeWidth={1.8} />,
    color: "#10B981",
    title: "Custos mensais detalhados",
    description:
      "Breakdown real dos gastos: OpenAI (Whisper + GPT-4o-mini), Supabase (Pro + Storage + bandwidth), Vercel, worker. Tabela por cenário (20/100/500/1000 ofertas) + onde economizar.",
    tags: ["custos", "OpenAI", "otimização"],
    estimated_read: "10min",
    updated_at: "2026-04-20",
  },
];

export default async function GuiasIndexPage() {
  await requireAdmin();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 max-w-[1280px] mx-auto">
      <header className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
          <BookOpen size={12} strokeWidth={2} />
          Guias para admin
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          Central de conhecimento
        </h1>
        <p className="text-[14px] text-text-2 max-w-[760px] leading-relaxed">
          Tudo que você precisa saber pra operar o Black Belt Swipe sem
          depender de suporte técnico. Cada guia explica uma parte do sistema
          em linguagem simples, com exemplos práticos e o que fazer quando
          algo dá errado.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="display text-[17px] font-semibold tracking-[-0.01em]">
            Guias disponíveis
          </h2>
          <p className="text-[12px] text-text-3 mt-0.5">
            {GUIDES.length} guia{GUIDES.length === 1 ? "" : "s"} pronto
            {GUIDES.length === 1 ? "" : "s"} pra leitura
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {GUIDES.map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </div>
      </section>

      <section
        className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3"
        style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)" }}
      >
        <Sparkles
          size={18}
          strokeWidth={1.8}
          style={{ color: "var(--accent)" }}
          className="mt-0.5 shrink-0"
        />
        <div className="flex flex-col gap-1">
          <h3 className="display text-[14px] font-semibold tracking-[-0.01em]">
            Sentindo falta de algum guia?
          </h3>
          <p className="text-[12.5px] text-text-2 leading-relaxed">
            Essa central cresce conforme o sistema. Quando tiver dúvida
            recorrente sobre alguma feature, me avisa — viro guia aqui pra
            consulta rápida.
          </p>
        </div>
      </section>
    </div>
  );
}

function GuideCard({ guide: g }: { guide: Guide }) {
  return (
    <Link
      href={`/admin/guias/${g.slug}`}
      className="
        group glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3
        cursor-pointer hover:border-[var(--border-strong)] hover:-translate-y-[2px]
        transition-all duration-[280ms] ease-[var(--ease-spring)]
      "
      style={{
        borderColor: `color-mix(in srgb, ${g.color} 35%, transparent)`,
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div
          className="w-10 h-10 rounded-[var(--r-sm)] grid place-items-center shrink-0"
          style={{
            background: `color-mix(in srgb, ${g.color} 15%, transparent)`,
            color: g.color,
          }}
        >
          {g.icon}
        </div>
        <span
          className="inline-flex items-center gap-1 text-[11px] text-text-3 shrink-0"
        >
          <Clock size={10} strokeWidth={1.8} />
          {g.estimated_read}
        </span>
      </header>

      <div className="flex flex-col gap-1.5">
        <h3 className="display text-[15px] font-semibold tracking-[-0.01em] leading-tight group-hover:text-[var(--accent)] transition-colors">
          {g.emoji} {g.title}
        </h3>
        <p className="text-[12.5px] text-text-2 leading-relaxed">
          {g.description}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {g.tags.map((t) => (
          <span
            key={t}
            className="text-[10px] text-text-3 px-1.5 py-0.5 rounded border border-[var(--border-hairline)]"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] mt-1 group-hover:gap-2 transition-all">
        Ler guia
        <ChevronRight size={13} strokeWidth={2} />
      </div>
    </Link>
  );
}
