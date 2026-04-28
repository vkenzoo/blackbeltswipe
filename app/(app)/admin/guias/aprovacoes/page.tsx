import Link from "next/link";
import {
  ChevronLeft,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Radar,
  Users,
  ExternalLink,
  Target,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  GuideSection,
  GuideTldr,
  GuidePanel,
  GuideSteps,
  GuideCallout,
  GuideKbd,
} from "@/components/admin/guide/primitives";

export default async function AprovacoesGuide() {
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
          <ShieldCheck size={12} strokeWidth={2} />
          Guia · Sistema de Aprovações
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          ✅ Sistema de Aprovações
        </h1>
        <p className="text-[14px] text-text-2 leading-relaxed">
          Black Belt Swipe tem 2 tipos de aprovação que protegem o catálogo
          contra automação mal calibrada. Este guia explica por que existem, o
          que cada um decide, e como criar um workflow rápido de revisão.
        </p>
      </header>

      <GuideTldr>
        <li>
          <strong>Aprovação de Pages</strong> (
          <Link href="/admin/aprovacoes" className="text-[var(--accent)] hover:underline">
            /admin/aprovacoes
          </Link>
          ): confirma que um <GuideKbd>page_id</GuideKbd> do Facebook pertence ao advertiser certo antes de sincronizar criativos dele.
        </li>
        <li>
          <strong>Aprovação de AI drafts</strong> (
          <Link href="/admin/ai-suggest" className="text-[var(--accent)] hover:underline">
            /admin/ai-suggest
          </Link>
          ): revisão das sugestões do GPT-4o-mini antes de aplicar em título/estrutura/tráfego/resumo.
        </li>
        <li>
          <strong>Regra de ouro</strong>: NADA da IA vira valor real sem admin clicar &quot;Aceitar&quot;. Campo protegido via{" "}
          <GuideKbd>ai_draft jsonb</GuideKbd> isolado do app público.
        </li>
        <li>
          <strong>Custo de rejeitar</strong>: zero. Descartar uma sugestão ou page não altera nada no catálogo.
        </li>
      </GuideTldr>

      {/* ── 1. Por que existem aprovações ── */}
      <GuideSection
        icon={<AlertTriangle size={16} strokeWidth={1.8} />}
        iconColor="var(--error)"
        title="1. Por que existe fila de aprovação?"
        subtitle="Lição aprendida na contaminação de 20/04: automação sem revisão vira bagunça."
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-2 leading-relaxed">
            Em 20/04/2026 o sistema teve uma contaminação: 17 pages ad_library
            de advertisers diferentes foram inseridas na oferta &quot;Sistema de Renda
            Oculta&quot; em burst, e o sync automático puxou 78 criativos errados
            (pessoas aleatórias que nada tinham a ver com a Elida Dias).
          </p>
          <p className="text-[13px] text-text-2 leading-relaxed">
            Resolvemos com 3 camadas: <strong>kill switch</strong> no discovery automático,{" "}
            <strong>gate verified_for_sync</strong> no banco, e{" "}
            <strong>UI de aprovação</strong> pra admin revisar caso a caso. Resultado: nunca mais contaminou.
          </p>
          <GuideCallout tone="error" title="Regra explícita">
            Toda page nova descoberta entra com{" "}
            <GuideKbd>verified_for_sync=false</GuideKbd>. Sync de criativos
            IGNORA pages nesse estado. Sem aprovação manual, criativo nenhum
            dessa page vai pro catálogo.
          </GuideCallout>
        </div>
      </GuideSection>

      {/* ── 2. Aprovação de Pages ── */}
      <GuideSection
        icon={<Radar size={16} strokeWidth={1.8} />}
        iconColor="#F59E0B"
        title="2. Aprovação de Pages — /admin/aprovacoes"
        subtitle="O que cada row significa e como decidir rápido."
      >
        <div className="flex flex-col gap-3">
          <GuidePanel
            title="O que mostra na tela"
            link="/admin/aprovacoes"
            items={[
              "Grid de cards agrupados por oferta",
              "Cada card: thumbnail, slug, status da oferta, N pages aprovadas, N pending",
              "Cada page dentro do card: meta_page_id, título, origem (discovered_via), data",
              "Análise por origem: friendly explanation + recomendação + risco",
              "Botões: Aprovar / Ignorar / Ver no Ad Library",
            ]}
          />

          <h3 className="text-[13px] font-semibold text-text mt-2">
            Os 4 tipos de origem e como decidir
          </h3>

          <div className="grid grid-cols-1 gap-2">
            <OriginRow
              color="#F59E0B"
              badge="auto_domain_discovery"
              risk="ALTO"
              explanation="Worker achou essa page buscando no Ad Library por ads que mencionam o domínio da oferta. Pode ser legítima (multi-page) ou completamente errada (outro advertiser citou o domínio)."
              action="SEMPRE abre no Ad Library antes. Se foto/nome do advertiser bate → aprova. Se não bate → rejeita."
            />
            <OriginRow
              color="var(--accent)"
              badge="manual_multi_page_review"
              risk="MÉDIO"
              explanation="Admin cadastrou manualmente mas foi a 2ª+ page da mesma oferta. Sistema coloca em quarentena pra você confirmar que é mesmo o mesmo advertiser com múltiplas Pages."
              action="Se é caso legítimo (tipo Paulo Borges com 2 Pages), aprova. Se cadastrou errado, rejeita."
            />
            <OriginRow
              color="var(--text-2)"
              badge="manual"
              risk="BAIXO"
              explanation="Cadastro manual tradicional via UI admin. Caiu aqui provavelmente por motivo automático (sistema quarentenou retroativamente)."
              action="Confere rápido e aprova se bate."
            />
            <OriginRow
              color="var(--error)"
              badge="auto_quarantined_contamination"
              risk="CRÍTICO"
              explanation="Page foi quarentenada pelo script de cleanup quando detectou contaminação em massa. Quase certo que é lixo."
              action="Default é rejeitar. Só aprovar se tiver CERTEZA olhando no Ad Library."
            />
          </div>

          <GuideCallout tone="info" title="Fluxo rápido">
            Abre a Ad Library num segundo monitor. Pra cada page pendente: olha
            nome + foto do advertiser → 1 clique aprovar/rejeitar → próxima.
            Admin treinado faz 20 pages em ~3 min.
          </GuideCallout>
        </div>
      </GuideSection>

      {/* ── 3. Aprovação de AI drafts ── */}
      <GuideSection
        icon={<Sparkles size={16} strokeWidth={1.8} />}
        iconColor="#8B5CF6"
        title="3. Aprovação de AI drafts — /admin/ai-suggest"
        subtitle="Sugestões do GPT-4o-mini pra título/estrutura/tráfego/resumo de cada oferta."
      >
        <div className="flex flex-col gap-3">
          <GuidePanel
            title="O que mostra na tela"
            link="/admin/ai-suggest"
            items={[
              "Stats: total de drafts, pendentes, aceitos, descartados, custo acumulado",
              "Breakdown: quais campos você mais aceita, quais structures IA sugere",
              "Filtros: pendentes / aceitos / descartados / todos",
              "Tabela: valor atual → sugestão IA por oferta",
              "Bulk: selecionar várias e aceitar/descartar/re-gerar de uma vez",
            ]}
          />

          <h3 className="text-[13px] font-semibold text-text mt-2">
            Campos que a IA sugere
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <GuidePanel
              title="🎯 Title (gancho)"
              items={[
                "Nome da oferta + o que ela entrega",
                "Ex: 'Quiz Bottrel — Propósito pra mulheres 35+'",
                "Aceitar quando fiel, editar quando vago",
                "Campo que mais varia em qualidade",
              ]}
            />
            <GuidePanel
              title="📊 Structure"
              items={[
                "vsl | quiz | low_ticket | infoproduto",
                "Tem confidence 0-1 associada",
                "Confidence &lt;70% → revisar com cuidado",
                "Structure reason explica escolha da IA",
              ]}
            />
            <GuidePanel
              title="📡 Traffic source"
              items={[
                "facebook | google | tiktok | multi",
                "IA infere pela linguagem e formato",
                "Quase sempre bate (90%+)",
                "Seguro aceitar em bulk",
              ]}
            />
            <GuidePanel
              title="💬 AI summary"
              items={[
                "2-3 frases descrevendo a oferta",
                "Usado no card + SEO interno",
                "Aceitar se capta o essencial",
                "Editar se tem jargão ou exagero",
              ]}
            />
          </div>

          <GuideCallout tone="warning" title="Quando re-gerar vs descartar">
            <strong>Re-gerar</strong>: sugestão tá ruim MAS o problema é que o
            prompt precisa ser melhor. Custa mais $0.003/oferta mas vale a pena
            iterar. <strong>Descartar</strong>: oferta não precisa de IA
            (exemplo: já tem título perfeito cadastrado, só quer que sistema
            pare de sugerir).
          </GuideCallout>
        </div>
      </GuideSection>

      {/* ── 4. Workflow ideal ── */}
      <GuideSection
        icon={<CheckCircle2 size={16} strokeWidth={1.8} />}
        iconColor="var(--success)"
        title="4. Workflow ideal pra admin"
        subtitle="Rotina diária ou 2-3× por semana — depende do volume de ofertas novas."
      >
        <GuideSteps
          items={[
            {
              num: 1,
              title: "Abre o sidebar e vê os 2 badges",
              body: (
                <>
                  Badge laranja em <strong>Aprovações</strong> = pages pendentes.
                  Badge azul em <strong>AI Suggest</strong> = drafts pendentes.
                  Se ambos zero, dia tranquilo, pula pro trabalho real.
                </>
              ),
            },
            {
              num: 2,
              title: "Limpa Pages primeiro",
              body: (
                <>
                  Vai em <Link href="/admin/aprovacoes" className="text-[var(--accent)] hover:underline">/admin/aprovacoes</Link>. Esse é o mais crítico — pages erradas contaminam criativos.
                  Abre Ad Library em outra aba. Confere cada uma: aprova ou rejeita.
                </>
              ),
            },
            {
              num: 3,
              title: "Depois AI Suggest em bulk",
              body: (
                <>
                  Vai em <Link href="/admin/ai-suggest" className="text-[var(--accent)] hover:underline">/admin/ai-suggest</Link>.
                  Filtro &quot;Pendentes&quot;. Vê a tabela. Seleciona as que
                  parecem boas (título faz sentido, structure bate) e clica &quot;Aceitar todas sugestões&quot;.
                </>
              ),
            },
            {
              num: 4,
              title: "Re-gera as ruins",
              body: (
                <>
                  Pra ofertas com sugestão ruim, seleciona e clica &quot;Re-gerar&quot;.
                  Custa ~$0.003 cada. Em 30s-1min aparecem sugestões novas.
                  Se ainda vier ruim 2x seguidas, o prompt tá errado — vai em{" "}
                  <Link href="/admin/ai-suggest/config" className="text-[var(--accent)] hover:underline">
                    config
                  </Link>{" "}
                  e ajusta.
                </>
              ),
            },
            {
              num: 5,
              title: "Publica ofertas em draft",
              body: (
                <>
                  Depois que AI Suggest foi aceito/descartado e pages aprovadas,
                  oferta tá pronta pra ir pro catálogo. Na edit page, muda{" "}
                  <GuideKbd>status=active</GuideKbd>. Agora aparece pro usuário
                  final.
                </>
              ),
            },
          ]}
        />
        <GuideCallout tone="info" title="Tempo total">
          Pra 10 ofertas novas: ~5-7min de atenção humana. Se rolasse no
          cadastro manual tradicional seria ~60-90min (digitando cada campo).
          10× mais rápido.
        </GuideCallout>
      </GuideSection>

      {/* ── 5. Quando coisas dão errado ── */}
      <GuideSection
        icon={<XCircle size={16} strokeWidth={1.8} />}
        iconColor="var(--error)"
        title="5. Reverter decisões erradas"
      >
        <div className="flex flex-col gap-3">
          <GuidePanel
            title="Aprovei uma sugestão IA ruim por engano"
            items={[
              "Campo já foi atualizado — mas é trivial reverter",
              "Abre a edit page da oferta",
              "Edita o campo na mão (sobrescreve o valor da IA)",
              "ai_accepted_fields continua no audit trail",
            ]}
          />
          <GuidePanel
            title="Aprovei uma page errada e criativos contaminados apareceram"
            items={[
              "Vai em /admin/aprovacoes, marca verified_for_sync=false de novo",
              "Criativos vinculados ficam órfãos no banco",
              "Roda scripts/diagnose-contamination.ts pra diagnóstico",
              "Roda com --fix pra esconder automaticamente",
            ]}
          />
          <GuidePanel
            title="Descartei uma sugestão boa por engano"
            items={[
              "Draft fica no banco em ai_draft, só com ai_discarded_at setado",
              "Na edit page, pode forçar regen via botão 'Re-gerar IA'",
              "Ou update manual no banco: UPDATE offers SET ai_discarded_at=null WHERE id=...",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── 6. Desligar tudo ── */}
      <GuideSection
        icon={<RefreshCw size={16} strokeWidth={1.8} />}
        iconColor="#06B6D4"
        title="6. Desligar aprovações temporariamente"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-2 leading-relaxed">
            Em momentos de volume alto (ex: importando 200 ofertas de uma vez)
            pode valer desligar AI Suggest e aprovar manualmente depois.
          </p>
          <GuidePanel
            title="Como desligar AI Suggest"
            link="/admin/ai-suggest/config"
            items={[
              "Vai em /admin/ai-suggest/config",
              "Toggle master 'AI Suggest ligado/desligado' → OFF",
              "Worker para de gerar drafts imediatamente",
              "Drafts existentes continuam revisáveis",
              "Religa quando quiser voltar",
            ]}
          />
          <GuidePanel
            title="Discovery automático de pages"
            items={[
              <>Já tá <strong>DESLIGADO</strong> por padrão (via <GuideKbd>DOMAIN_DISCOVERY_ENABLED=false</GuideKbd>)</>,
              "Nova page só entra quando admin cadastra manual",
              "Fila de Aprovações fica mais vazia naturalmente",
              "Pra reativar: editar env var no worker",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── Rodapé ── */}
      <section
        className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3"
        style={{ borderLeft: "3px solid var(--text-3)" }}
      >
        <Users size={16} strokeWidth={1.8} className="text-text-3 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2 leading-relaxed">
          <p className="text-text font-medium">Princípio central</p>
          <p>
            Automação acelera, humano decide. A IA sugere, o admin aprova.
            Esse é o contrato do Black Belt Swipe — foi construído pra nunca
            você acordar com surpresa ruim no catálogo.
          </p>
          <div className="flex flex-col gap-1 pt-1">
            <Link href="/admin/guias/cadastrar-oferta" className="hover:text-text inline-flex items-center gap-1">
              <Target size={10} strokeWidth={1.8} />
              Guia de cadastro de oferta
            </Link>
            <Link href="/admin/guias/troubleshooting" className="hover:text-text inline-flex items-center gap-1">
              <ExternalLink size={10} strokeWidth={1.8} />
              Guia de troubleshooting
            </Link>
          </div>
        </div>
      </section>

      <div className="h-12" aria-hidden />
    </div>
  );
}

function OriginRow({
  color,
  badge,
  risk,
  explanation,
  action,
}: {
  color: string;
  badge: string;
  risk: string;
  explanation: string;
  action: string;
}) {
  return (
    <div
      className="glass rounded-[var(--r-md)] p-3 flex flex-col gap-2"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          {badge}
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          risco {risk}
        </span>
      </div>
      <p className="text-[12px] text-text-2 leading-relaxed">{explanation}</p>
      <p className="text-[12px] text-text leading-relaxed">
        <strong className="font-semibold">Ação: </strong>
        {action}
      </p>
    </div>
  );
}
