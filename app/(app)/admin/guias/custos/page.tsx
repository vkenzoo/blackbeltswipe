import Link from "next/link";
import {
  ChevronLeft,
  DollarSign,
  Brain,
  Database,
  Zap,
  Server,
  TrendingDown,
  ExternalLink,
  Calculator,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  GuideSection,
  GuideTldr,
  GuidePanel,
  GuideCallout,
  GuideKbd,
} from "@/components/admin/guide/primitives";

export default async function CustosGuide() {
  await requireAdmin();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 max-w-[900px] mx-auto">
      <Link
        href="/admin/guias"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2 hover:text-text transition-colors w-fit -mb-2"
      >
        <ChevronLeft size={14} strokeWidth={1.8} />
        Voltar pros guias
      </Link>

      <header className="flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
          <DollarSign size={12} strokeWidth={2} />
          Guia · Custos mensais
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          💰 Custos mensais detalhados
        </h1>
        <p className="text-[14px] text-text-2 leading-relaxed">
          Breakdown completo dos custos operacionais do Black Belt Swipe, por
          fornecedor, com números reais baseados no uso atual. Mostra
          também onde dá pra economizar sem perder funcionalidade.
        </p>
      </header>

      <GuideTldr>
        <li>
          <strong>Total mensal estimado (20 ofertas ativas)</strong>: ~$30 USD — a maior parte é Supabase Pro fixo ($25).
        </li>
        <li>
          <strong>Custo marginal por oferta nova</strong>: ~$0.13 (Whisper $0.10 + GPT-4o-mini $0.003 + Supabase Storage insignificante).
        </li>
        <li>
          <strong>Escala linear</strong>: 100 ofertas/mês = ~$40/mês · 500 ofertas/mês = ~$90/mês · 1000/mês = ~$150/mês.
        </li>
        <li>
          <strong>Onde economizar</strong>: reduzir chunks do Whisper, desligar AI Suggest, reduzir retention no Storage.
        </li>
      </GuideTldr>

      {/* ── 1. OpenAI ── */}
      <GuideSection
        icon={<Brain size={16} strokeWidth={1.8} />}
        iconColor="#10B981"
        title="1. OpenAI — maior custo variável"
        subtitle="Duas APIs usadas: Whisper (transcrição) e GPT-4o-mini (classificação + AI Suggest)."
      >
        <div className="flex flex-col gap-3">
          <div
            className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5"
            style={{ borderLeft: "3px solid #10B981" }}
          >
            <h3 className="display text-[14px] font-semibold tracking-[-0.01em] flex items-center gap-2">
              🎤 Whisper (transcrição de VSL)
              <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #10B981 14%, transparent)", color: "#10B981" }}>
                $0.006/min
              </span>
            </h3>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              Cobrado por minuto de áudio transcrito. VSL médio no Brasil tem
              15-40min. Preço: <strong>$0.09 a $0.24 por VSL</strong>.
            </p>
            <ul className="text-[12px] text-text-2 space-y-1 pl-4">
              <li>• Whisper roda apenas 1× por VSL (quando upload é feito)</li>
              <li>• Se VSL &gt;25MB, sistema faz chunking em 20min e re-cola timestamps</li>
              <li>• Re-enrich não re-transcreve (aproveita cache)</li>
              <li>• Custo total pros 20 VSLs atuais: ~$2</li>
            </ul>
          </div>

          <div
            className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5"
            style={{ borderLeft: "3px solid #10B981" }}
          >
            <h3 className="display text-[14px] font-semibold tracking-[-0.01em] flex items-center gap-2">
              🧠 GPT-4o-mini (classificação + AI Suggest)
              <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #10B981 14%, transparent)", color: "#10B981" }}>
                $0.15/1M in · $0.60/1M out
              </span>
            </h3>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              Usado em 2 lugares: <strong>classificação de nicho</strong> (~$0.0002/oferta, negligenciável) e <strong>AI Suggest</strong> (~$0.003/oferta com vision, ~$0.001 sem vision).
            </p>
            <ul className="text-[12px] text-text-2 space-y-1 pl-4">
              <li>• Re-gerar sugestão custa mesmo valor de novo</li>
              <li>• Custo de backfill nas 20 ofertas: ~$0.06 uma vez</li>
              <li>• 100 ofertas novas/mês = ~$0.30 apenas disso</li>
              <li>• Se desligar vision: ~3× mais barato</li>
            </ul>
          </div>

          <GuideCallout tone="info" title="Onde monitorar">
            Dashboard oficial em{" "}
            <a
              href="https://platform.openai.com/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              platform.openai.com/usage
            </a>
            . Stats internas do sistema em{" "}
            <Link href="/admin/ai-suggest" className="text-[var(--accent)] hover:underline">
              /admin/ai-suggest
            </Link>{" "}
            (custo acumulado em tokens).
          </GuideCallout>
        </div>
      </GuideSection>

      {/* ── 2. Supabase ── */}
      <GuideSection
        icon={<Database size={16} strokeWidth={1.8} />}
        iconColor="#8B5CF6"
        title="2. Supabase — base fixa + variável"
      >
        <div className="flex flex-col gap-3">
          <div
            className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5"
            style={{ borderLeft: "3px solid #8B5CF6" }}
          >
            <h3 className="display text-[14px] font-semibold tracking-[-0.01em] flex items-center gap-2">
              Plano Pro
              <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #8B5CF6 14%, transparent)", color: "#8B5CF6" }}>
                $25/mês fixo
              </span>
            </h3>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              Inclui cotas generosas: <strong>100GB storage, 250GB bandwidth,
              500MB realtime, 100k auth users, unlimited API calls</strong>. Pra
              escala atual cobre tudo com folga.
            </p>
            <ul className="text-[12px] text-text-2 space-y-1 pl-4">
              <li>• Database: já no plano. ~50MB atual vs 8GB disponível.</li>
              <li>• Auth: ilimitado no Pro.</li>
              <li>• Realtime: não usamos (sistema é polling).</li>
              <li>• Edge Functions: não usamos (worker é separado).</li>
            </ul>
          </div>

          <div
            className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5"
            style={{ borderLeft: "3px solid #8B5CF6" }}
          >
            <h3 className="display text-[14px] font-semibold tracking-[-0.01em] flex items-center gap-2">
              Storage de VSLs e thumbs
              <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #8B5CF6 14%, transparent)", color: "#8B5CF6" }}>
                incluso até 100GB
              </span>
            </h3>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              VSL médio comprimido tem 50MB. 20 VSLs = ~1GB. Thumbs são
              leves (~50KB cada). Mesmo com 500 ofertas, fica em ~25GB.
            </p>
            <ul className="text-[12px] text-text-2 space-y-1 pl-4">
              <li>• Screenshots de landings: ~200KB cada, otimizadas via render endpoint.</li>
              <li>• Creatives: ~5-10MB por video criativo</li>
              <li>• Total pra 500 ofertas: ~25GB (25% do limite)</li>
            </ul>
          </div>

          <div
            className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5"
            style={{ borderLeft: "3px solid #8B5CF6" }}
          >
            <h3 className="display text-[14px] font-semibold tracking-[-0.01em] flex items-center gap-2">
              Bandwidth (egress)
              <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, #8B5CF6 14%, transparent)", color: "#8B5CF6" }}>
                $0.09/GB acima de 250GB
              </span>
            </h3>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              Cada usuário que assiste um VSL consome ~50MB de bandwidth. Com
              100 usuários ativos assistindo 5 VSLs/dia = 25GB/dia = ~750GB/mês
              = $45 extra.
            </p>
            <GuideCallout tone="warning" title="Ponto de atenção">
              Quando user base crescer, migrar VSLs pra CloudFlare Stream
              (mais barato pra video). Hoje ainda cabe.
            </GuideCallout>
          </div>
        </div>
      </GuideSection>

      {/* ── 3. Meta API ── */}
      <GuideSection
        icon={<Zap size={16} strokeWidth={1.8} />}
        iconColor="#F59E0B"
        title="3. Meta Ad Library API"
      >
        <GuidePanel
          title="$0 — gratuito"
          items={[
            "Meta não cobra pela Ad Library API",
            "Rate limit: ~200 chamadas/hora por app",
            "Refresh diário das 20 ofertas: ~20 calls = 0.1% do limite",
            "Sync de criativos: 1 call por page ativa",
            "Sistema respeita rate limit automaticamente via sweep sequencial",
          ]}
        />
        <GuideCallout tone="info" title="Custo indireto">
          O que &quot;custa&quot; é o tempo: quando token expira (a cada 60d), você
          precisa gastar ~2min gerando e colando o novo em{" "}
          <Link href="/admin/meta-api" className="text-[var(--accent)] hover:underline">
            /admin/meta-api
          </Link>
          .
        </GuideCallout>
      </GuideSection>

      {/* ── 4. Infra (Vercel + Worker) ── */}
      <GuideSection
        icon={<Server size={16} strokeWidth={1.8} />}
        iconColor="#06B6D4"
        title="4. Infra (Vercel + Worker)"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <GuidePanel
            title="Vercel (hospedagem Next.js)"
            items={[
              <><strong>Hobby</strong>: grátis, suficiente pro atual</>,
              "100GB bandwidth incluso",
              "6000 minutos de serverless incluso",
              "Se crescer: Pro $20/mês (raramente necessário)",
              "Deploy automático via Git",
            ]}
          />
          <GuidePanel
            title="Worker (Coolify VPS)"
            items={[
              "Atualmente rodando local (dev)",
              "Pra produção: VPS $10-20/mês (Hetzner/DO)",
              "Precisa: ~2GB RAM, ffmpeg, Playwright",
              "Coolify simplifica deploy + restart",
              "Escala horizontal adicionando workers",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── 5. Tabela de cenários ── */}
      <GuideSection
        icon={<Calculator size={16} strokeWidth={1.8} />}
        iconColor="#EC4899"
        title="5. Cálculo total por cenário"
      >
        <div className="glass rounded-[var(--r-md)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold border-b border-[var(--border-hairline)]">
                <th className="text-left px-4 py-3">Cenário</th>
                <th className="text-right px-3 py-3">OpenAI</th>
                <th className="text-right px-3 py-3">Supabase</th>
                <th className="text-right px-3 py-3">Infra</th>
                <th className="text-right px-3 py-3">Total/mês</th>
              </tr>
            </thead>
            <tbody className="text-[12.5px]">
              <CostRow scenario="Atual (20 ofertas, 0 users)" openai="~$0" supabase="$25" infra="$0" total="~$25" />
              <CostRow scenario="100 ofertas novas/mês" openai="~$15" supabase="$25" infra="$0" total="~$40" />
              <CostRow scenario="500 ofertas + 500 users" openai="~$65" supabase="$25" infra="$20" total="~$110" />
              <CostRow scenario="1000 ofertas + 2000 users" openai="~$130" supabase="$25" infra="$60" total="~$215" highlight />
            </tbody>
          </table>
        </div>
        <GuideCallout tone="info" title="Premissas">
          Cada oferta nova = 1 transcrição Whisper ($0.10) + 1 AI Suggest
          ($0.003). Users = custo de bandwidth de VSL. Infra = Vercel Pro +
          worker VPS quando crescer.
        </GuideCallout>
      </GuideSection>

      {/* ── 6. Otimizações ── */}
      <GuideSection
        icon={<TrendingDown size={16} strokeWidth={1.8} />}
        iconColor="#10B981"
        title="6. Onde economizar se precisar"
      >
        <div className="flex flex-col gap-3">
          <GuidePanel
            title="Economia fácil (zero impacto na UX)"
            items={[
              <>Desligar vision do AI Suggest em <Link href="/admin/ai-suggest/config" className="text-[var(--accent)] hover:underline">config</Link> — 3× mais barato ($0.001/oferta)</>,
              "Reduzir transcript_max_chars de 4000 pra 2500 — 30% menos tokens sem perder qualidade",
              "Aumentar refresh_interval_hours pras ofertas 'dead' (score 0) — menos calls Meta",
              "Cachear screenshots por 7 dias (hoje é 24h)",
            ]}
          />
          <GuidePanel
            title="Economia média (requer ajuste)"
            items={[
              "Comprimir VSLs com preset 'medium' ao invés de 'fast' — 20% menor",
              "Deletar VSLs de ofertas paused há >60 dias (manter transcript, apagar mp4)",
              "Usar cdn pra thumbs ao invés do Supabase render endpoint",
              "Batch de transcribe em horário offpeak (Whisper não tem descontos, mas spreads o custo)",
            ]}
          />
          <GuidePanel
            title="Desligar completamente se crítico"
            items={[
              "AI Suggest pode ser desligado em /admin/ai-suggest/config — elimina $5-10/mês",
              "Creatives sync pode pular ofertas 'dead' (flag opcional)",
              "Re-transcribe desabilitado quando transcript_text já existe (já é o default)",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── Rodapé ── */}
      <section
        className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3"
        style={{ borderLeft: "3px solid var(--text-3)" }}
      >
        <DollarSign size={16} strokeWidth={1.8} className="text-text-3 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2 leading-relaxed">
          <p className="text-text font-medium">Onde checar gastos reais</p>
          <div className="flex flex-col gap-1">
            <a
              href="https://platform.openai.com/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text inline-flex items-center gap-1"
            >
              <ExternalLink size={10} strokeWidth={1.8} />
              OpenAI Usage Dashboard
            </a>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text inline-flex items-center gap-1"
            >
              <ExternalLink size={10} strokeWidth={1.8} />
              Supabase Dashboard · Billing
            </a>
            <Link href="/admin/ai-suggest" className="hover:text-text inline-flex items-center gap-1">
              <ExternalLink size={10} strokeWidth={1.8} />
              Stats AI Suggest (tokens in app)
            </Link>
          </div>
        </div>
      </section>

      <div className="h-12" aria-hidden />
    </div>
  );
}

function CostRow({
  scenario,
  openai,
  supabase,
  infra,
  total,
  highlight,
}: {
  scenario: string;
  openai: string;
  supabase: string;
  infra: string;
  total: string;
  highlight?: boolean;
}) {
  return (
    <tr
      className="border-t border-[var(--border-hairline)]"
      style={
        highlight
          ? {
              background: "color-mix(in srgb, var(--accent) 6%, transparent)",
            }
          : undefined
      }
    >
      <td className="px-4 py-2.5 text-text">{scenario}</td>
      <td className="px-3 py-2.5 text-right mono text-text-2 tabular-nums">{openai}</td>
      <td className="px-3 py-2.5 text-right mono text-text-2 tabular-nums">{supabase}</td>
      <td className="px-3 py-2.5 text-right mono text-text-2 tabular-nums">{infra}</td>
      <td
        className="px-3 py-2.5 text-right mono tabular-nums font-semibold"
        style={{ color: highlight ? "var(--accent)" : "var(--text)" }}
      >
        {total}
      </td>
    </tr>
  );
}
