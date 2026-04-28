import Link from "next/link";
import {
  ChevronLeft,
  Rocket,
  Key,
  Zap,
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Radio,
  Info,
  ExternalLink,
  Wrench,
  Target,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function MetaApiGuidePage() {
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
          <Rocket size={12} strokeWidth={2} />
          Guia · Meta Ad Library API
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          📡 Como funciona a conexão com a Meta
        </h1>
        <p className="text-[14px] text-text-2 leading-relaxed">
          O Black Belt Swipe usa a API oficial do Facebook (Meta Ad Library API)
          pra buscar os anúncios ativos das ofertas cadastradas. Este guia
          explica como configurar, como funciona o token, o que fazer quando
          expira e como monitorar o uso.
        </p>
      </header>

      {/* TL;DR — o essencial */}
      <section
        className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3"
        style={{
          borderLeft: "3px solid var(--accent)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, transparent) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          <Zap
            size={14}
            strokeWidth={2}
            style={{ color: "var(--accent)" }}
          />
          <h2 className="display text-[14px] font-semibold tracking-[-0.01em]">
            TL;DR — o que você precisa saber
          </h2>
        </div>
        <ul className="flex flex-col gap-2 text-[12.5px] text-text-2 leading-relaxed list-disc pl-5">
          <li>
            Token é gerenciado direto em{" "}
            <Link
              href="/admin/meta-api"
              className="text-[var(--accent)] hover:underline font-medium"
            >
              /admin/meta-api
            </Link>
            . Você nunca precisa editar arquivo <code className="mono text-[11px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>.env</code>.
          </li>
          <li>
            Token de user <strong>long-lived dura 60 dias</strong>. Banner fica
            laranja 7 dias antes de expirar. Quando expirar, gera um novo no
            Graph API Explorer e cola na UI.
          </li>
          <li>
            Meta permite ~<strong>200 chamadas/hora</strong> pra Ad Library.
            Sistema espalha o refresh das ofertas naturalmente em ciclos de
            24h — você não estoura.
          </li>
          <li>
            Se identidade do usuário Meta não tá confirmada, <strong>nenhum
            token funciona</strong> pro Ad Library. Ver seção &quot;Troubleshooting&quot;
            abaixo.
          </li>
        </ul>
      </section>

      {/* Seção 1: Tipos de token */}
      <Section
        icon={<Key size={16} strokeWidth={1.8} />}
        iconColor="#06B6D4"
        title="1. Os 3 tipos de token que existem"
        subtitle="Cada um com duração e uso diferente. Hoje usamos long-lived user token."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TokenCard
            type="User Token (curto)"
            duration="~2 horas"
            color="var(--error)"
            prosCons={[
              { type: "pro", text: "Gera rápido no Graph Explorer" },
              { type: "con", text: "Expira toda vez que você fecha o browser" },
              { type: "con", text: "Não serve pra produção" },
            ]}
            summary="Usado só como ponto de partida — você troca por um long-lived logo depois."
          />
          <TokenCard
            type="User Token (long-lived)"
            duration="60 dias"
            color="var(--success)"
            prosCons={[
              { type: "pro", text: "Renovação é 1 clique a cada 2 meses" },
              { type: "pro", text: "Funciona pro Ad Library API" },
              { type: "pro", text: "Sistema renova sem restart" },
              { type: "con", text: "Precisa trocar manualmente a cada 60d" },
            ]}
            summary="Atual escolha do sistema. Balance certo entre segurança e manutenção."
          />
          <TokenCard
            type="System User Token"
            duration="Indefinido"
            color="var(--accent)"
            prosCons={[
              { type: "pro", text: "Nunca expira" },
              { type: "con", text: "Requer Business Verification completa" },
              { type: "con", text: "Setup mais complexo (~30min)" },
              { type: "con", text: "App precisa ter Advanced Access" },
            ]}
            summary="Upgrade possível no futuro quando o Business estiver 100% verificado."
          />
        </div>
      </Section>

      {/* Seção 2: Como gerar/trocar */}
      <Section
        icon={<Zap size={16} strokeWidth={1.8} />}
        iconColor="#F59E0B"
        title="2. Como gerar e trocar o token (passo a passo)"
      >
        <Steps
          items={[
            {
              num: 1,
              title: "Abre o Graph API Explorer",
              body: (
                <>
                  Vai em{" "}
                  <a
                    href="https://developers.facebook.com/tools/explorer/1498058201904365/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                  >
                    developers.facebook.com/tools/explorer/
                    <ExternalLink size={10} strokeWidth={1.8} />
                  </a>
                </>
              ),
            },
            {
              num: 2,
              title: "Seleciona app e tipo",
              body: (
                <>
                  No painel direito: <strong>&quot;BB Swipe&quot;</strong> como app,{" "}
                  <strong>&quot;User Token&quot;</strong> como tipo. Só permission{" "}
                  <code className="mono text-[11px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>public_profile</code>{" "}
                  é suficiente — nada mais.
                </>
              ),
            },
            {
              num: 3,
              title: "Clica &quot;Generate Access Token&quot;",
              body: (
                <>
                  Vai abrir um popup do Facebook pedindo tua conta logar.
                  Confirma. Volta no Explorer e um token novo aparece (string
                  começando com <code className="mono text-[11px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>EAA...</code>).
                </>
              ),
            },
            {
              num: 4,
              title: "Copia o token",
              body: (
                <>
                  Botão de cópia ao lado da string. Token é válido por 2h — vamos
                  trocar por long-lived nos próximos passos.
                </>
              ),
            },
            {
              num: 5,
              title: "Cola em /admin/meta-api",
              body: (
                <>
                  Abre{" "}
                  <Link
                    href="/admin/meta-api"
                    className="text-[var(--accent)] hover:underline font-medium"
                  >
                    /admin/meta-api
                  </Link>
                  . No card &quot;Token da Meta API&quot;, escolhe o modo{" "}
                  <strong>&quot;Trocar por long-lived (60d)&quot;</strong>, cola o token
                  curto no textarea, clica <strong>&quot;Trocar e salvar&quot;</strong>.
                </>
              ),
            },
            {
              num: 6,
              title: "Sistema faz o resto",
              body: (
                <>
                  O servidor pega teu token de 2h, troca automaticamente pelo
                  long-lived de 60 dias (usando App ID + Secret guardados no .env),
                  salva no banco. Toast verde: &quot;Token trocado, válido por ~60 dias&quot;.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* Seção 3: Monitoramento */}
      <Section
        icon={<Radio size={16} strokeWidth={1.8} />}
        iconColor="#10B981"
        title="3. Como monitorar o uso"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel
            title="Dashboard Meta API"
            link="/admin/meta-api"
            items={[
              "Taxa de sucesso das últimas 24h",
              "Tempo médio de resposta",
              "Total de ads retornados",
              "Chamadas por hora (histograma)",
              "Top erros com contagem",
              "Breakdown por handler (quem chama mais)",
            ]}
          />
          <Panel
            title="Erros do sistema"
            link="/admin/erros"
            items={[
              "Erros agrupados por código Meta",
              "Tradução friendly pro admin",
              "Sugestão de ação pra cada erro",
              "Severidade automática",
              "Ofertas afetadas por cada erro",
            ]}
          />
        </div>
      </Section>

      {/* Seção 4: Troubleshooting */}
      <Section
        icon={<Wrench size={16} strokeWidth={1.8} />}
        iconColor="#EF4444"
        title="4. Troubleshooting — erros comuns"
      >
        <div className="flex flex-col gap-3">
          <ErrorCard
            code="190 / 463 / 467"
            title="Token expirou"
            friendly="Signal mais comum. Aconteceu depois dos 60 dias, ou você gerou novo token Meta e os antigos foram invalidados automaticamente."
            action={
              <>
                Gera novo token no Graph Explorer e cola em{" "}
                <Link href="/admin/meta-api" className="text-[var(--accent)] hover:underline">
                  /admin/meta-api
                </Link>
                . Cache do worker se atualiza em 30s.
              </>
            }
            severity="high"
          />
          <ErrorCard
            code="10 / 2332002"
            title="Identidade não confirmada"
            friendly="Meta exige verificação de identidade (documento + foto) antes de liberar Ad Library API. Sem isso, NENHUM token funciona pra esse endpoint."
            action={
              <>
                Vai em{" "}
                <a
                  href="https://business.facebook.com/settings/info/identity-confirmation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  business.facebook.com → Identity Confirmation{" "}
                  <ExternalLink size={10} strokeWidth={1.8} />
                </a>{" "}
                e submete documento. Revisão da Meta leva 1-3 dias úteis.
              </>
            }
            severity="critical"
          />
          <ErrorCard
            code="4 / 17 / 613"
            title="Rate limit atingido"
            friendly="Sistema fez mais de ~200 chamadas na última hora. Meta bloqueia temporariamente (1h). Não é ruim, só precisa aguardar."
            action="Espera 1 hora. Se acontece toda hora, diminui a frequência do sweep de refresh ou aumenta refresh_interval_hours pras ofertas frias."
            severity="warning"
          />
          <ErrorCard
            code="100"
            title="Parâmetro inválido"
            friendly="Algum page_id que estamos consultando não existe mais (advertiser trocou de Page ou foi banido). Sistema loga e pula."
            action="Normal acontecer esporadicamente. Se for frequente, a oferta pode estar com page_id stale — admin revisa em /admin/offers/[id]/edit."
            severity="low"
          />
          <ErrorCard
            code="200 / 299"
            title="Sem permissão"
            friendly="App não tem ads_archive aprovada em Advanced Access, ou a Page consultada tá privada."
            action="Solicita Advanced Access da permission ads_archive em developers.facebook.com → teu app → App Review. Review manual da Meta leva dias."
            severity="high"
          />
          <ErrorCard
            code="1 / 2"
            title="Meta caiu"
            friendly="Servidor interno da Meta com problema. Raro mas acontece. Nada que você possa fazer."
            action={
              <>
                Checa{" "}
                <a
                  href="https://metastatus.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  metastatus.com
                  <ExternalLink size={10} strokeWidth={1.8} />
                </a>
                . Geralmente resolve em 15-30min sozinho.
              </>
            }
            severity="low"
          />
        </div>
      </Section>

      {/* Seção 5: Segurança e anti-contaminação */}
      <Section
        icon={<Shield size={16} strokeWidth={1.8} />}
        iconColor="#8B5CF6"
        title="5. Proteção contra contaminação"
        subtitle="Sistema tem múltiplas camadas pra evitar pages erradas grudarem nas ofertas."
      >
        <div className="flex flex-col gap-3">
          <Panel
            title="Gate de verificação"
            link="/admin/aprovacoes"
            items={[
              "Nova page de Ad Library entra como verified_for_sync=false",
              "Sync de criativos SÓ lê pages verified=true",
              "Admin aprova individualmente em /admin/aprovacoes",
              "Múltiplas pages (≥3) disparam alerta de suspeita",
            ]}
          />
          <Panel
            title="Kill switches"
            items={[
              "DOMAIN_DISCOVERY_ENABLED=false por padrão (descoberta auto desligada)",
              "Cada page recém-descoberta fica em quarentena esperando revisão",
              "Admin consegue descartar em 1 clique se veio errada",
              "Audit trail via discovered_via guarda como cada page entrou",
            ]}
          />
        </div>
      </Section>

      {/* Rodapé — mais info */}
      <section
        className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3"
        style={{
          borderLeft: "3px solid var(--text-3)",
        }}
      >
        <Info size={16} strokeWidth={1.8} className="text-text-3 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2 leading-relaxed">
          <p className="text-text font-medium">Links úteis</p>
          <div className="flex flex-col gap-1">
            <a
              href="https://developers.facebook.com/docs/marketing-api/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text inline-flex items-center gap-1"
            >
              <ExternalLink size={10} strokeWidth={1.8} />
              Docs oficiais — Marketing API
            </a>
            <a
              href="https://www.facebook.com/ads/library/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text inline-flex items-center gap-1"
            >
              <ExternalLink size={10} strokeWidth={1.8} />
              Ad Library API — Getting Started
            </a>
            <a
              href="https://developers.facebook.com/docs/graph-api/guides/error-handling"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text inline-flex items-center gap-1"
            >
              <ExternalLink size={10} strokeWidth={1.8} />
              Códigos de erro do Graph API
            </a>
            <Link
              href="/admin/meta-api"
              className="hover:text-text inline-flex items-center gap-1"
            >
              <Target size={10} strokeWidth={1.8} />
              Dashboard Meta API · monitoramento ao vivo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Section({
  icon,
  iconColor,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-[var(--r-sm)] grid place-items-center shrink-0 mt-0.5"
          style={{
            background: `color-mix(in srgb, ${iconColor} 14%, transparent)`,
            color: iconColor,
          }}
        >
          {icon}
        </div>
        <div className="flex flex-col gap-0.5">
          <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12.5px] text-text-2 leading-relaxed max-w-[620px]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="pl-12">{children}</div>
    </section>
  );
}

function TokenCard({
  type,
  duration,
  color,
  prosCons,
  summary,
}: {
  type: string;
  duration: string;
  color: string;
  prosCons: Array<{ type: "pro" | "con"; text: string }>;
  summary: string;
}) {
  return (
    <div
      className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex flex-col gap-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded w-fit"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          {duration}
        </span>
        <h3 className="display text-[13.5px] font-semibold tracking-[-0.01em] mt-1">
          {type}
        </h3>
      </div>
      <ul className="flex flex-col gap-1 text-[11.5px]">
        {prosCons.map((pc, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {pc.type === "pro" ? (
              <CheckCircle2
                size={11}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--success)" }}
              />
            ) : (
              <AlertTriangle
                size={11}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--text-3)" }}
              />
            )}
            <span className={pc.type === "pro" ? "text-text-2" : "text-text-3"}>
              {pc.text}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-text-3 italic leading-snug pt-2 border-t border-[var(--border-hairline)]">
        {summary}
      </p>
    </div>
  );
}

function Steps({
  items,
}: {
  items: Array<{ num: number; title: string; body: React.ReactNode }>;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.num} className="flex items-start gap-3">
          <span
            className="w-7 h-7 rounded-full grid place-items-center text-[12px] font-semibold shrink-0"
            style={{
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
              color: "var(--accent)",
            }}
          >
            {item.num}
          </span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <h4 className="text-[13px] font-semibold text-text">{item.title}</h4>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Panel({
  title,
  link,
  items,
}: {
  title: string;
  link?: string;
  items: string[];
}) {
  return (
    <div className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display text-[13.5px] font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        {link && (
          <Link
            href={link}
            className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            Abrir
            <ExternalLink size={9} strokeWidth={2} />
          </Link>
        )}
      </div>
      <ul className="flex flex-col gap-1 text-[12px] text-text-2">
        {items.map((text, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <CheckCircle2
              size={10}
              strokeWidth={2}
              className="mt-1 shrink-0 text-text-3"
            />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorCard({
  code,
  title,
  friendly,
  action,
  severity,
}: {
  code: string;
  title: string;
  friendly: string;
  action: React.ReactNode;
  severity: "low" | "warning" | "high" | "critical";
}) {
  const colors = {
    low: "#06B6D4",
    warning: "#F59E0B",
    high: "#F59E0B",
    critical: "var(--error)",
  };
  const color = colors[severity];

  return (
    <div
      className="glass rounded-[var(--r-md)] p-4 flex gap-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <AlertTriangle
        size={14}
        strokeWidth={2}
        className="mt-0.5 shrink-0"
        style={{ color }}
      />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
            }}
          >
            code {code}
          </span>
          <h4 className="text-[13px] font-semibold text-text">{title}</h4>
        </div>
        <p className="text-[12.5px] text-text-2 leading-relaxed">{friendly}</p>
        <div
          className="text-[12px] text-text leading-relaxed rounded-[var(--r-sm)] px-3 py-2"
          style={{
            background: `color-mix(in srgb, ${color} 5%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
          }}
        >
          <span
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color }}
          >
            O que fazer →{" "}
          </span>
          {action}
        </div>
      </div>
    </div>
  );
}
