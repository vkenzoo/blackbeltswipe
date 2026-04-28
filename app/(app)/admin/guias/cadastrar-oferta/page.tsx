import Link from "next/link";
import {
  ChevronLeft,
  Target,
  Zap,
  Layers,
  Pencil,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Video,
  FileText,
  Eye,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  GuideSection,
  GuideTldr,
  GuideSteps,
  GuidePanel,
  GuideCallout,
  GuideKbd,
} from "@/components/admin/guide/primitives";

export default async function CadastrarOfertaGuide() {
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
          <Target size={12} strokeWidth={2} />
          Guia · Cadastrar ofertas
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          🎯 Cadastrar uma oferta do zero
        </h1>
        <p className="text-[14px] text-text-2 leading-relaxed">
          3 formas de adicionar oferta no catálogo — cada uma pra situação
          diferente. Este guia mostra o fluxo completo, quando usar cada método,
          e como aproveitar a automação pra cadastrar em 30s em vez de 10min.
        </p>
      </header>

      <GuideTldr>
        <li>
          <strong>Forma mais rápida</strong>: cola URL da landing em{" "}
          <Link href="/admin/offers" className="text-[var(--accent)] hover:underline">/admin/offers</Link> → worker faz TUDO automaticamente (extrai VSL, transcreve, classifica nicho, gera sugestões IA). Atenção humana: ~30s.
        </li>
        <li>
          Oferta começa <strong>status=draft</strong> — invisível pro usuário final. Você só publica depois de revisar e clicar pra ativar.
        </li>
        <li>
          Para <strong>múltiplas ofertas de uma vez</strong>, usa batch em{" "}
          <Link href="/admin/offers/batch" className="text-[var(--accent)] hover:underline">/admin/offers/batch</Link> (sobe mp4 + cola título em cada um).
        </li>
        <li>
          <strong>Manual</strong> só se quiser controle absoluto do campo a campo — mais trabalhoso mas útil quando a URL tá protegida e worker não consegue acessar.
        </li>
      </GuideTldr>

      {/* ── 1. Escolha do método ── */}
      <GuideSection
        icon={<Layers size={16} strokeWidth={1.8} />}
        iconColor="var(--accent)"
        title="1. Qual método usar?"
        subtitle="Cada um tem um caso de uso específico. Regra: sempre começar pelo from-URL."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <GuidePanel
            title="🚀 From URL (recomendado)"
            items={[
              "Admin cola 1 link da landing",
              "Worker faz TUDO (~3 min)",
              "AI Suggest preenche título, estrutura, summary",
              "Ideal pra 90% dos casos",
            ]}
          />
          <GuidePanel
            title="📚 Batch"
            items={[
              "Sobe múltiplos mp4 + cola títulos de uma vez",
              "Útil quando tem VSLs baixados",
              "Evita re-enrich de cada um",
              "Ver /admin/offers/batch",
            ]}
          />
          <GuidePanel
            title="✏️ Manual"
            items={[
              "Admin digita tudo (5-7 campos)",
              "~3 min de digitação",
              "Sem automação",
              "Só quando a URL tá inacessível",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── 2. Fluxo From URL ── */}
      <GuideSection
        icon={<Zap size={16} strokeWidth={1.8} />}
        iconColor="#F59E0B"
        title="2. Fluxo completo via From URL"
        subtitle="O caminho mais rápido. Abaixo, passo a passo do que acontece."
      >
        <GuideSteps
          items={[
            {
              num: 1,
              title: "Cola a URL",
              body: (
                <>
                  Abre{" "}
                  <Link href="/admin/offers" className="text-[var(--accent)] hover:underline">
                    /admin/offers
                  </Link>
                  , clica no botão roxo <strong>&quot;From URL&quot;</strong> no topo.
                  Cola a landing da oferta (pode ser o VSL, quiz, ou Ad Library).
                </>
              ),
            },
            {
              num: 2,
              title: "Stub criado imediato",
              body: (
                <>
                  Sistema insere oferta com título <GuideKbd>&quot;Extraindo...&quot;</GuideKbd>{" "}
                  e status <GuideKbd>draft</GuideKbd>. Aparece na lista com uma
                  linha pulsante mostrando o progresso do worker em tempo real.
                </>
              ),
            },
            {
              num: 3,
              title: "Worker abre a página",
              body: (
                <>
                  Playwright com stealth plugin (anti-detecção) abre a URL como
                  browser real. Tira screenshot, identifica VSL no HTML,
                  identifica checkout se houver. Se é Ad Library, também
                  extrai <GuideKbd>meta_page_id</GuideKbd> e ads ativos.
                </>
              ),
            },
            {
              num: 4,
              title: "Baixa e processa VSL",
              body: (
                <>
                  Se achou vídeo, baixa via ffmpeg (HLS ou mp4 direto). Comprime
                  se &gt;50MB pra caber no Storage. Gera thumbnail do frame aos
                  3s. Sobe tudo pro bucket <GuideKbd>vsls/</GuideKbd> e{" "}
                  <GuideKbd>thumbs/</GuideKbd>.
                </>
              ),
            },
            {
              num: 5,
              title: "Transcreve com Whisper",
              body: (
                <>
                  VSL vai pra OpenAI Whisper API. Retorna texto completo (~5-15KB
                  por VSL de 15-40min). Salva em{" "}
                  <GuideKbd>transcript_text</GuideKbd> + preview truncado em{" "}
                  <GuideKbd>transcript_preview</GuideKbd>.
                </>
              ),
            },
            {
              num: 6,
              title: "GPT-4o-mini classifica nicho",
              body: (
                <>
                  Lê título + transcrição + copy dos ads e escolhe 1 dos 8
                  nichos (renda_extra, finanças, saúde, beleza, etc). Custo
                  ~$0.0002.
                </>
              ),
            },
            {
              num: 7,
              title: "AI Suggest gera draft de metadata",
              body: (
                <>
                  Novo: GPT-4o-mini com vision analisa transcript + screenshot
                  da landing e sugere <strong>título, estrutura, tráfego,
                  resumo, tags</strong>. Tudo vai pra{" "}
                  <GuideKbd>offers.ai_draft</GuideKbd> aguardando tua revisão.
                </>
              ),
            },
            {
              num: 8,
              title: "Admin revisa e publica",
              body: (
                <>
                  Você abre{" "}
                  <Link href="/admin/ai-suggest" className="text-[var(--accent)] hover:underline">
                    /admin/ai-suggest
                  </Link>{" "}
                  ou a edit page da oferta. Vê banner com as sugestões. Aceita
                  tudo de uma vez ou campo por campo. Depois muda{" "}
                  <GuideKbd>status=active</GuideKbd> e a oferta aparece no
                  catálogo público.
                </>
              ),
            },
          ]}
        />
        <GuideCallout tone="info" title="Tempo real">
          Steps 3-6 rolam em ~2-3 min no worker. Passo 7 (AI Suggest) é mais
          15-30s extras. Total: ~3-4 min automatizados. Atenção humana só no
          passo 8 (~30s).
        </GuideCallout>
      </GuideSection>

      {/* ── 3. Revisar AI Suggest ── */}
      <GuideSection
        icon={<Sparkles size={16} strokeWidth={1.8} />}
        iconColor="#8B5CF6"
        title="3. Como revisar as sugestões da IA"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <GuidePanel
            title="No banner da edit page"
            link="/admin/offers"
            items={[
              "Campo a campo: valor atual vs sugestão IA",
              "Botão 'Aceitar' por campo (flexível)",
              "Botão 'Aceitar todos' de uma vez",
              "Botão 'Re-gerar' se GPT veio ruim",
              "Botão 'Descartar' pra ignorar tudo",
            ]}
          />
          <GuidePanel
            title="No hub AI Suggest"
            link="/admin/ai-suggest"
            items={[
              "Vê todas as ofertas com drafts pendentes",
              "Stats: taxa de aceitação + custo total",
              "Bulk: seleciona várias e aceita/descarta",
              "Filtros: só pendentes, aceitos, descartados",
            ]}
          />
        </div>
        <GuideCallout tone="warning" title="Importante">
          IA <strong>nunca</strong> escreve em title/structure/traffic/summary
          automaticamente. Fica só em <GuideKbd>ai_draft</GuideKbd> até você
          aprovar. Oferta fica como draft enquanto isso.
        </GuideCallout>
      </GuideSection>

      {/* ── 4. Publicar oferta ── */}
      <GuideSection
        icon={<CheckCircle2 size={16} strokeWidth={1.8} />}
        iconColor="var(--success)"
        title="4. Do draft pra ativa (publicar)"
        subtitle="Último checklist antes de expor no catálogo público."
      >
        <div className="flex flex-col gap-3">
          <GuidePanel
            title="Checklist de publicação"
            items={[
              <>Título não começa mais com <GuideKbd>Extraindo...</GuideKbd></>,
              "Thumbnail real carregou (não é o gradient placeholder)",
              "Transcrição tem pelo menos 500 chars",
              "Nicho faz sentido",
              "AI Suggest foi revisado (aceito ou descartado)",
              "Pelo menos 1 creative visível na galeria",
              <>Status muda pra <GuideKbd>active</GuideKbd> no dropdown</>,
            ]}
          />
          <GuideCallout tone="info" title="Onde mudar status">
            Na edit page da oferta em{" "}
            <Link href="/admin/offers" className="text-[var(--accent)] hover:underline">
              /admin/offers
            </Link>
            , campo <strong>Status</strong> tem 3 opções:{" "}
            <GuideKbd>draft</GuideKbd> (invisível),{" "}
            <GuideKbd>active</GuideKbd> (catálogo público),{" "}
            <GuideKbd>paused</GuideKbd> (sai do catálogo mas continua no admin).
          </GuideCallout>
        </div>
      </GuideSection>

      {/* ── 5. Quando re-enriquecer ── */}
      <GuideSection
        icon={<RefreshCw size={16} strokeWidth={1.8} />}
        iconColor="#06B6D4"
        title="5. Quando rodar re-enrich"
        subtitle="Oferta cadastrada pode precisar de atualização depois — quando e por quê."
      >
        <div className="flex flex-col gap-3">
          <GuidePanel
            title="Botão 'Atualizar agora' na edit page"
            items={[
              "Advertiser mudou o VSL — re-baixa e transcreve",
              "Subiu criativos novos — sync pega eles",
              "Nicho classificado errado — re-classifica",
              "Quer sugestões IA novas (prompt mudou)",
              "Screenshot tá outdated",
            ]}
          />
          <GuidePanel
            title="Auto-updates (sem admin clicar)"
            items={[
              "Ad count atualiza a cada 24h (sweep automático)",
              "Scale score recalcula a cada refresh_ad_count",
              "Auto-pausa se ad_count=0 por 3 dias",
              "Auto-ativa se ressuscita",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── 6. Batch ── */}
      <GuideSection
        icon={<Layers size={16} strokeWidth={1.8} />}
        iconColor="#EC4899"
        title="6. Batch — múltiplas ofertas de uma vez"
      >
        <GuideSteps
          items={[
            {
              num: 1,
              title: "Abre /admin/offers/batch",
              body: "Tela com área de drag-and-drop e textarea pra colar URLs.",
            },
            {
              num: 2,
              title: "Arrasta mp4s OU cola URLs",
              body: "Cada mp4 vira uma oferta com título inferido do nome do arquivo. Cada URL dispara worker from-url-button.",
            },
            {
              num: 3,
              title: "Edita títulos na tela",
              body: "Cada linha mostra slug gerado + permite editar título antes de criar. Smart defaults de nicho/language/structure aplicam a todas.",
            },
            {
              num: 4,
              title: "Clica 'Criar todas'",
              body: "Processamento sequencial pra não saturar o worker. Progresso por linha. Ofertas criadas vão pra /admin/offers, já em draft.",
            },
          ]}
        />
        <GuideCallout tone="info" title="Quando vale a pena">
          Batch é melhor pra &gt;5 ofertas. Menos que isso, o from-URL direto é
          mais simples e a AI Suggest roda automaticamente. Batch pula AI
          Suggest por padrão (você pode rodar depois via re-enrich).
        </GuideCallout>
      </GuideSection>

      {/* ── Links relacionados ── */}
      <section className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3" style={{ borderLeft: "3px solid var(--text-3)" }}>
        <Eye size={16} strokeWidth={1.8} className="text-text-3 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2 leading-relaxed">
          <p className="text-text font-medium">Guias relacionados</p>
          <div className="flex flex-col gap-1">
            <Link href="/admin/guias/meta-api" className="hover:text-text inline-flex items-center gap-1">
              <ExternalLink size={10} strokeWidth={1.8} />
              Meta API — configuração do token e troubleshooting
            </Link>
            <Link href="/admin/guias/workers" className="hover:text-text inline-flex items-center gap-1">
              <ExternalLink size={10} strokeWidth={1.8} />
              Workers — o que cada um faz durante o enrich
            </Link>
            <Link href="/admin/ai-suggest/config" className="hover:text-text inline-flex items-center gap-1">
              <Sparkles size={10} strokeWidth={1.8} />
              Config AI Suggest — ajustar prompt
            </Link>
          </div>
        </div>
      </section>

      <div className="h-12" aria-hidden />
    </div>
  );
}
