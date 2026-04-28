import Link from "next/link";
import {
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  Clock,
  Package,
  RefreshCw,
  Layers,
  Radar,
  Search,
  User,
  Layers as LayersIcon,
  AlertOctagon,
  HelpCircle,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  listPendingApprovals,
  type PendingOfferGroup,
  type PendingPage,
} from "@/lib/queries/pending-approvals";
import { ApprovalActions } from "./approval-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AprovacoesPage() {
  await requireAdmin();
  const groups = await listPendingApprovals();

  const totalPages = groups.reduce((s, g) => s + g.pending_pages.length, 0);

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1280px] mx-auto">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Admin
          </div>
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em] flex items-center gap-3">
            Aprovações pendentes
            {totalPages > 0 && (
              <span
                className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: "color-mix(in srgb, #F59E0B 16%, transparent)",
                  color: "#F59E0B",
                }}
              >
                {totalPages}
              </span>
            )}
          </h1>
          <p className="text-[13px] text-text-2 mt-1 max-w-[640px]">
            Pages do Ad Library aguardando tua revisão. Foram cadastradas via
            cadastro bulk, descoberta automática, ou múltiplas pages adicionadas
            na mesma oferta. Aprova o que é legítimo (do mesmo advertiser) e
            rejeita o que veio errado — o sync de criativos só consome pages
            aprovadas.
          </p>
        </div>
        <form action="/admin/aprovacoes">
          <button
            type="submit"
            className="
              inline-flex items-center gap-2 h-9 px-4 rounded-full
              glass-light text-[13px] font-medium text-text
              hover:bg-[var(--bg-glass-hover)] transition-colors
            "
          >
            <RefreshCw size={13} strokeWidth={1.8} />
            Atualizar
          </button>
        </form>
      </header>

      {/* Explainer banner */}
      <div
        className="glass-light rounded-[var(--r-md)] px-4 py-3 flex items-start gap-3"
        style={{
          background: "color-mix(in srgb, var(--accent) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
        }}
      >
        <ShieldAlert
          size={15}
          strokeWidth={1.8}
          style={{ color: "var(--accent)" }}
          className="mt-0.5 shrink-0"
        />
        <div className="flex flex-col gap-1 text-[12.5px]">
          <p className="text-text font-medium">
            Proteção anti-contaminação ativa
          </p>
          <p className="text-text-2 leading-relaxed">
            Pages não-aprovadas ficam invisíveis pro sync-creatives → não
            contaminam o catálogo com ads de outros advertisers. Abre o link da
            page pra confirmar que é mesmo o advertiser certo antes de aprovar.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<Clock size={13} strokeWidth={1.8} />}
          label="Pages aguardando"
          value={totalPages.toLocaleString("pt-BR")}
          tone={totalPages > 10 ? "warning" : totalPages > 0 ? "info" : "default"}
        />
        <StatCard
          icon={<Package size={13} strokeWidth={1.8} />}
          label="Ofertas afetadas"
          value={groups.length.toLocaleString("pt-BR")}
        />
        <StatCard
          icon={<Layers size={13} strokeWidth={1.8} />}
          label="Ação recomendada"
          value={
            totalPages === 0
              ? "Tudo em dia"
              : totalPages > 10
                ? "Revisar agora"
                : "Revisar"
          }
          tone={
            totalPages === 0
              ? "success"
              : totalPages > 10
                ? "warning"
                : "default"
          }
        />
      </section>

      {/* Empty state */}
      {groups.length === 0 ? (
        <section className="glass rounded-[var(--r-lg)] py-16 flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-full grid place-items-center"
            style={{
              background: "color-mix(in srgb, var(--success) 14%, transparent)",
            }}
          >
            <CheckCircle2
              size={28}
              strokeWidth={1.8}
              style={{ color: "var(--success)" }}
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h2 className="display text-[18px] font-semibold text-text">
              Nada pra aprovar
            </h2>
            <p className="text-[13px] text-text-3 text-center max-w-md">
              Todas as pages do catálogo estão aprovadas pro sync. Se alguma
              oferta precisar de page nova, cadastra pela página de edição da
              oferta — a 2ª+ page entra aqui pra revisão.
            </p>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {groups.map((g) => (
            <OfferApprovalCard key={g.offer_id} group={g} />
          ))}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Offer group card
// ─────────────────────────────────────────────────────────────

function OfferApprovalCard({ group }: { group: PendingOfferGroup }) {
  const thumbUrl = group.offer_thumb_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/thumbs/${group.offer_thumb_path}?width=120&quality=75&resize=cover`
    : null;

  return (
    <div className="glass rounded-[var(--r-lg)] overflow-hidden">
      {/* Header: offer info */}
      <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center gap-4 flex-wrap">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`Thumb de ${group.offer_title}`}
            className="w-14 h-14 rounded-[var(--r-md)] object-cover border border-[var(--border-hairline)] shrink-0"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-[var(--r-md)] border border-[var(--border-hairline)] grid place-items-center text-text-3 shrink-0"
            style={{ background: "var(--bg-elevated)" }}
          >
            <Package size={18} strokeWidth={1.5} />
          </div>
        )}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11.5px] text-text-3">
            <span className="mono">/app/{group.offer_slug}</span>
            <span
              className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{
                color:
                  group.offer_status === "active"
                    ? "var(--success)"
                    : group.offer_status === "paused"
                      ? "var(--error)"
                      : "var(--text-3)",
                background: `color-mix(in srgb, ${
                  group.offer_status === "active"
                    ? "var(--success)"
                    : group.offer_status === "paused"
                      ? "var(--error)"
                      : "var(--text-3)"
                } 14%, transparent)`,
              }}
            >
              {group.offer_status}
            </span>
            <span>·</span>
            <span>
              {group.verified_count} page
              {group.verified_count === 1 ? "" : "s"} aprovada
              {group.verified_count === 1 ? "" : "s"}
            </span>
          </div>
          <h2 className="display text-[16px] font-semibold text-text tracking-[-0.01em] truncate">
            {group.offer_title}
          </h2>
          <p className="text-[11.5px] text-text-3">
            {group.pending_pages.length} page
            {group.pending_pages.length === 1 ? "" : "s"} aguardando aprovação
          </p>
        </div>
        <Link
          href={`/admin/offers/${group.offer_id}/edit`}
          className="
            inline-flex items-center gap-1.5 px-3 h-8 rounded-full
            text-[11.5px] font-medium text-text-2 hover:text-text
            border border-[var(--border-hairline)] hover:bg-[var(--bg-glass)]
            transition-colors shrink-0
          "
        >
          Abrir oferta
          <ExternalLink size={11} strokeWidth={1.8} />
        </Link>
      </div>

      {/* Pages rows */}
      <ul className="divide-y divide-[var(--border-hairline)]">
        {group.pending_pages.map((p) => (
          <PendingPageRow key={p.id} page={p} groupPageCount={group.pending_pages.length} />
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pending page row — com análise de origem e recomendação
// ─────────────────────────────────────────────────────────────

function PendingPageRow({
  page,
  groupPageCount,
}: {
  page: PendingPage;
  groupPageCount: number;
}) {
  const analysis = analyzePage(page, groupPageCount);

  return (
    <li className="px-5 py-4 flex flex-col gap-3 hover:bg-[var(--bg-glass)] transition-colors">
      {/* Header row: ID + timestamp + Ad Library link */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="mono text-[12px] font-semibold text-text">
            page_id {page.meta_page_id ?? "?"}
          </span>
          <span className="mono text-[10.5px] text-text-3">
            cadastrada {formatDate(page.created_at)}
          </span>
        </div>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="
            inline-flex items-center gap-1.5 px-3 h-7 rounded-full
            text-[11px] font-medium text-text-2 hover:text-text
            border border-[var(--border-hairline)] hover:bg-[var(--bg-glass)]
            transition-colors shrink-0
          "
          title="Abrir no Ad Library pra validar se é o advertiser correto"
        >
          Ver no Ad Library
          <ExternalLink size={10} strokeWidth={1.8} />
        </a>
        <ApprovalActions pageId={page.id} />
      </div>

      {/* Título da page, se existir */}
      {page.title && (
        <div className="text-[12.5px] text-text-2 leading-snug">
          {page.title}
        </div>
      )}

      {/* ANÁLISE — explicação friendly de por que tá aqui */}
      <div
        className="flex items-start gap-3 rounded-[var(--r-sm)] px-3 py-2.5"
        style={{
          background: `color-mix(in srgb, ${analysis.color} 6%, transparent)`,
          border: `1px solid color-mix(in srgb, ${analysis.color} 20%, transparent)`,
        }}
      >
        <span
          className="shrink-0 mt-0.5 grid place-items-center w-5 h-5 rounded-full"
          style={{
            color: analysis.color,
            background: `color-mix(in srgb, ${analysis.color} 14%, transparent)`,
          }}
        >
          {analysis.icon}
        </span>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: analysis.color }}
            >
              {analysis.sourceLabel}
            </span>
            <span className="mono text-[10px] text-text-3 px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)" }}>
              {page.discovered_via ?? "manual"}
            </span>
            <span
              className="text-[10.5px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{
                color: analysis.riskColor,
                background: `color-mix(in srgb, ${analysis.riskColor} 14%, transparent)`,
              }}
            >
              risco {analysis.riskLabel}
            </span>
          </div>
          <p className="text-[12px] text-text leading-relaxed">
            <strong className="font-semibold">Análise:</strong>{" "}
            {analysis.explanation}
          </p>
          <p className="text-[12px] text-text-2 leading-relaxed">
            <strong className="font-semibold">Recomendação:</strong>{" "}
            {analysis.recommendation}
          </p>
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────
// Analyze origin — mapeia discovered_via em contexto friendly
// ─────────────────────────────────────────────────────────────

type Analysis = {
  sourceLabel: string;
  icon: React.ReactNode;
  color: string;
  riskLabel: string;
  riskColor: string;
  explanation: string;
  recommendation: string;
};

function analyzePage(page: PendingPage, groupPageCount: number): Analysis {
  const via = page.discovered_via ?? "manual";

  switch (via) {
    case "auto_domain_discovery":
      return {
        sourceLabel: "Descoberta automática por domínio",
        icon: <Radar size={11} strokeWidth={2} />,
        color: "#F59E0B",
        riskLabel: "alto",
        riskColor: "var(--error)",
        explanation:
          "Esta page foi encontrada automaticamente pelo worker buscando no Ad Library por ads que mencionam o domínio principal da oferta. Ela pode ser de um advertiser totalmente diferente que por acaso mencionou o mesmo domínio no anúncio.",
        recommendation:
          "Abre o Ad Library e confere se a foto/nome do advertiser bate com a oferta. Se não bater, rejeita. Se bater (caso multi-Page legítimo), aprova.",
      };

    case "ad_library_page_search":
      return {
        sourceLabel: "Scraping por page_id",
        icon: <Search size={11} strokeWidth={2} />,
        color: "var(--accent)",
        riskLabel: "médio",
        riskColor: "#F59E0B",
        explanation:
          "Page encontrada via scraping do Ad Library (Playwright) usando o page_id específico. Origem técnica mais confiável que descoberta por domínio, mas ainda precisa validação.",
        recommendation: "Confere no Ad Library se o conteúdo dos ads bate com a oferta.",
      };

    case "manual_multi_page_review":
      return {
        sourceLabel: "Multi-page cadastrada pelo admin",
        icon: <LayersIcon size={11} strokeWidth={2} />,
        color: "var(--accent)",
        riskLabel: groupPageCount > 3 ? "alto" : "médio",
        riskColor: groupPageCount > 3 ? "var(--error)" : "#F59E0B",
        explanation: `Você cadastrou ${groupPageCount} pages na mesma oferta. A 1ª entra aprovada direto; as 2ª+ passam por aqui pra evitar bulk insert errado (como o caso de 17 pages de advertisers diferentes cadastradas em burst em 20/04).`,
        recommendation:
          groupPageCount > 3
            ? "Volume alto — provavelmente foi cadastro em lote por engano. Valida com cuidado e rejeita as que não forem do mesmo advertiser."
            : "Se é caso legítimo (tipo Paulo Borges com 2 Pages), aprova. Se veio errada, rejeita.",
      };

    case "auto_quarantined_contamination_2026_04_20":
      return {
        sourceLabel: "Quarentenada no cleanup de 2026-04-20",
        icon: <AlertOctagon size={11} strokeWidth={2} />,
        color: "var(--error)",
        riskLabel: "crítico",
        riskColor: "var(--error)",
        explanation:
          "Esta page foi uma das 17 inseridas em burst na oferta 'Sistema de Renda Oculta' no incidente de contaminação de 20/04. O cleanup automático marcou como não-verificada pra revisão.",
        recommendation:
          "Quase certo que deve ser rejeitada. Só aprova se, ao abrir no Ad Library, você confirmar que é mesmo a Elida (a dona da oferta).",
      };

    case "manual":
    default:
      return {
        sourceLabel: "Cadastro manual",
        icon: <User size={11} strokeWidth={2} />,
        color: "var(--text-2)",
        riskLabel: "baixo",
        riskColor: "var(--accent)",
        explanation:
          "Cadastrada manualmente via admin, mas caiu em quarentena (provavelmente por ser 2ª+ page da oferta ou por ter sido quarentenada retroativamente).",
        recommendation: "Confere no Ad Library e aprova se for legítima.",
      };
  }
}

// ─────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "#F59E0B"
        : tone === "info"
          ? "var(--accent)"
          : "var(--text)";

  return (
    <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <span className="text-text-3">{icon}</span>
        {label}
      </div>
      <div
        className="display text-[22px] font-semibold tracking-[-0.02em] mt-0.5"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
