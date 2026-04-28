import Link from "next/link";
import {
  ChevronLeft,
  Wrench,
  Activity,
  AlertCircle,
  HeartPulse,
  Database,
  ImageIcon,
  Mic,
  Sparkles,
  Key,
  ExternalLink,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  GuideSection,
  GuideTldr,
  GuidePanel,
  GuideCallout,
  GuideKbd,
  GuideProblemCard,
} from "@/components/admin/guide/primitives";

export default async function TroubleshootingGuide() {
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
          <Wrench size={12} strokeWidth={2} />
          Guia · Troubleshooting
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          🔧 Troubleshooting geral
        </h1>
        <p className="text-[14px] text-text-2 leading-relaxed">
          Os problemas mais frequentes do sistema e o que fazer pra resolver.
          Leia de cima pra baixo ou pule direto pro sintoma que você tá vendo.
        </p>
      </header>

      <GuideTldr>
        <li>
          <strong>Onde olhar primeiro (por ordem)</strong>:{" "}
          <Link href="/admin/erros" className="text-[var(--accent)] hover:underline">/admin/erros</Link> (erros friendly) →{" "}
          <Link href="/admin/workers" className="text-[var(--accent)] hover:underline">/admin/workers</Link> (worker rodando?) →{" "}
          <Link href="/admin/logs" className="text-[var(--accent)] hover:underline">/admin/logs</Link> (feed geral).
        </li>
        <li>
          <strong>80% dos problemas</strong> são: token Meta expirado, worker travado, ou OpenAI rate limit.
        </li>
        <li>
          <strong>Nunca execute &quot;apagar ofertas em massa&quot; sem diagnóstico.</strong> Use retry de job antes de deletar qualquer coisa.
        </li>
      </GuideTldr>

      {/* ── 1. Onde diagnosticar ── */}
      <GuideSection
        icon={<HeartPulse size={16} strokeWidth={1.8} />}
        iconColor="#8B5CF6"
        title="1. Telas de diagnóstico (na ordem)"
        subtitle="Antes de mexer em qualquer coisa, abra essas 3 em abas diferentes."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <GuidePanel
            title="1️⃣ Erros"
            link="/admin/erros"
            items={[
              "Erros agrupados por tipo",
              "Tradução friendly",
              "Sugestão de ação por erro",
              "Severidade: crítico/alto/médio/baixo",
              "Filtros: 24h, 3d, 7d, 30d",
            ]}
          />
          <GuidePanel
            title="2️⃣ Workers"
            link="/admin/workers"
            items={[
              "Heartbeat — worker vivo?",
              "Jobs rodando agora",
              "Jobs em erro com retry",
              "Timeline dos últimos jobs",
              "Saúde por tipo (enrich, transcribe…)",
            ]}
          />
          <GuidePanel
            title="3️⃣ Logs"
            link="/admin/logs"
            items={[
              "Feed unificado de eventos",
              "Filtros: usuário, admin, worker, API, etc",
              "Toggle 'só erros'",
              "Ações de cada usuário",
              "Rastro de auditoria",
            ]}
          />
        </div>
      </GuideSection>

      {/* ── 2. Worker travado ── */}
      <GuideSection
        icon={<Activity size={16} strokeWidth={1.8} />}
        iconColor="var(--error)"
        title="2. Worker parado ou travado"
      >
        <div className="flex flex-col gap-3">
          <GuideProblemCard
            severity="critical"
            problem="Worker não atualiza nada há &gt;5min"
            signs={
              <>
                Em <Link href="/admin/workers" className="text-[var(--accent)] hover:underline">/admin/workers</Link>, o card &quot;Heartbeat&quot; mostra &quot;há X min&quot; &gt; 2min, ou &quot;offline&quot;. Jobs pendentes acumulam sem processar.
              </>
            }
            cause="Processo do worker caiu (OOM, crash, deploy interrompido) ou tá rodando mas bloqueou numa call externa (Whisper/Meta API travou)."
            solution={
              <>
                No terminal onde o worker roda: <GuideKbd>pkill -f &quot;bun.*worker/index&quot;</GuideKbd> depois{" "}
                <GuideKbd>cd ~/dev/blackbeltswipe &amp;&amp; bun --env-file=.env.local run worker/index.ts</GuideKbd>. Em &lt;5s o heartbeat volta. Se cair de novo, olha o output do terminal.
              </>
            }
          />
          <GuideProblemCard
            severity="high"
            problem="Jobs ficam 'running' infinito (sem terminar)"
            signs="Em /admin/workers, 1 ou mais jobs com status 'running' há &gt;10min. Outros jobs esperando."
            cause="Job preso esperando recurso externo (Playwright travou, Whisper em timeout). Worker não marca como erro pq não estourou o timeout global ainda."
            solution={
              <>
                Aguarda o timeout (15-30min dependendo do kind). Se quiser forçar, restart do worker conforme problema acima. Job vira &quot;error&quot; e entra na fila de retry automaticamente.
              </>
            }
          />
          <GuideProblemCard
            severity="warning"
            problem="Job dá erro mesmo após 3 retries"
            signs={
              <>
                Job aparece com <GuideKbd>retry_count=3</GuideKbd> e{" "}
                <GuideKbd>status=error</GuideKbd>. Não tenta de novo sozinho.
              </>
            }
            cause="Erro consistente (ex: URL quebrada, VSL corrompido, API bloqueada). Sistema parou de insistir pra economizar."
            solution={
              <>
                Clica em &quot;Retry&quot; no card do job em{" "}
                <Link href="/admin/workers" className="text-[var(--accent)] hover:underline">/admin/workers</Link>{" "}
                pra forçar mais uma tentativa. Se continuar falhando, lê o erro técnico — geralmente é a oferta que precisa fix (URL mudou, VSL removido).
              </>
            }
          />
        </div>
      </GuideSection>

      {/* ── 3. Token Meta ── */}
      <GuideSection
        icon={<Key size={16} strokeWidth={1.8} />}
        iconColor="#F59E0B"
        title="3. Token Meta expirou"
      >
        <GuideProblemCard
          severity="critical"
          problem="Erros 190/463/467 em /admin/erros"
          signs={
            <>
              Em <Link href="/admin/meta-api" className="text-[var(--accent)] hover:underline">/admin/meta-api</Link>, card do token fica VERMELHO &quot;Inválido&quot;. Refresh de ad_count falha em TODAS as ofertas. Sync de criativos para.
            </>
          }
          cause="Token de user dura 60 dias no máximo. Após 60 dias, a Meta invalida e toda chamada retorna 190."
          solution={
            <>
              1. Abre{" "}
              <a
                href="https://developers.facebook.com/tools/explorer/1498058201904365/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Graph API Explorer
              </a>{" "}
              2. Gera novo user token (só permission public_profile)
              3. Cola em{" "}
              <Link href="/admin/meta-api" className="text-[var(--accent)] hover:underline">
                /admin/meta-api
              </Link>{" "}
              no modo &quot;Trocar por long-lived&quot;
              4. Sistema salva no banco, worker pega em 30s sem restart.{" "}
              <Link href="/admin/guias/meta-api" className="text-[var(--accent)] hover:underline">
                Guia detalhado →
              </Link>
            </>
          }
        />
      </GuideSection>

      {/* ── 4. Ofertas sem thumbnail/criativos ── */}
      <GuideSection
        icon={<ImageIcon size={16} strokeWidth={1.8} />}
        iconColor="#EC4899"
        title="4. Ofertas sem thumbnail ou criativos"
      >
        <div className="flex flex-col gap-3">
          <GuideProblemCard
            severity="warning"
            problem="Card aparece com gradient colorido ao invés de thumb"
            signs={
              <>
                No catálogo, a oferta mostra só gradient no lugar do thumb. Na edit page, campo{" "}
                <GuideKbd>vsl_thumbnail_path</GuideKbd> tá nulo.
              </>
            }
            cause="Worker não conseguiu baixar o VSL (HLS encriptado, 404, timeout). Thumb depende do vídeo. Sem VSL, sem thumb."
            solution={
              <>
                Na edit page da oferta, clica &quot;Atualizar agora&quot;. Se VSL mesmo não tá acessível, faz upload manual do mp4 pelo próprio form. Sistema gera thumb automaticamente depois.
              </>
            }
          />
          <GuideProblemCard
            severity="warning"
            problem="Oferta tem 0 criativos visíveis"
            signs="Aba 'Criativos' vazia, mas worker rodou o sync. Em /admin/aprovacoes, pode ter pages em quarentena."
            cause={
              <>
                Sync só lê pages com{" "}
                <GuideKbd>verified_for_sync=true</GuideKbd>. Se as ad_library pages estão em quarentena, sync pula todas.
              </>
            }
            solution={
              <>
                Vai em{" "}
                <Link href="/admin/aprovacoes" className="text-[var(--accent)] hover:underline">
                  /admin/aprovacoes
                </Link>
                . Aprova a page correta (confere no Ad Library se é o advertiser certo). Depois roda re-enrich na oferta.
              </>
            }
          />
          <GuideProblemCard
            severity="low"
            problem="Criativos mostram pessoas/marcas erradas"
            signs="Thumbs de criativos claramente são de outros advertisers."
            cause="Page errada foi aprovada por engano OU domain discovery automático colou pages ruins antes do gate de verificação ser aplicado."
            solution={
              <>
                Escondeu todos criativos da oferta rodando script de limpeza.
                Script base:{" "}
                <GuideKbd>scripts/diagnose-contamination.ts --fix</GuideKbd>.
                Depois valida as pages em{" "}
                <Link href="/admin/aprovacoes" className="text-[var(--accent)] hover:underline">
                  /admin/aprovacoes
                </Link>{" "}
                e aprova só a real.
              </>
            }
          />
        </div>
      </GuideSection>

      {/* ── 5. Transcrição ── */}
      <GuideSection
        icon={<Mic size={16} strokeWidth={1.8} />}
        iconColor="#06B6D4"
        title="5. Transcrição falhou ou tá vazia"
      >
        <GuideProblemCard
          severity="warning"
          problem="transcript_text está null após worker terminar"
          signs="Edit page da oferta mostra 'Sem transcrição' mesmo tendo VSL baixado."
          cause={
            <>
              Whisper falhou (VSL &gt;25MB sem chunking, rate limit, áudio vazio, ou
              arquivo corrompido). Worker não bloqueia o enrich — transcription é best-effort.
            </>
          }
          solution={
            <>
              Re-transcreve via botão na edit page (dispara job{" "}
              <GuideKbd>transcribe_vsl</GuideKbd>). Se vier vazio de novo, provavelmente VSL é muito longo — ajusta chunking em{" "}
              <GuideKbd>lib/worker/transcribe.ts</GuideKbd>{" "}
              ou diminui o max chars no prompt do AI Suggest.
            </>
          }
        />
      </GuideSection>

      {/* ── 6. AI Suggest ── */}
      <GuideSection
        icon={<Sparkles size={16} strokeWidth={1.8} />}
        iconColor="#8B5CF6"
        title="6. AI Suggest não gera sugestões"
      >
        <div className="flex flex-col gap-3">
          <GuideProblemCard
            severity="low"
            problem="Oferta nova não tem banner de IA"
            signs={
              <>
                Em{" "}
                <Link href="/admin/ai-suggest" className="text-[var(--accent)] hover:underline">
                  /admin/ai-suggest
                </Link>
                , a oferta não aparece nem como pendente.
              </>
            }
            cause={
              <>
                Feature pode estar desligada em{" "}
                <Link href="/admin/ai-suggest/config" className="text-[var(--accent)] hover:underline">
                  /admin/ai-suggest/config
                </Link>
                , OU <GuideKbd>OPENAI_API_KEY</GuideKbd> não configurada, OU transcrição ainda tá vazia (IA precisa de texto).
              </>
            }
            solution={
              <>
                Verifica toggle master em{" "}
                <Link href="/admin/ai-suggest/config" className="text-[var(--accent)] hover:underline">
                  /admin/ai-suggest/config
                </Link>
                . Verifica .env.local tem <GuideKbd>OPENAI_API_KEY=sk-...</GuideKbd>. Verifica oferta tem transcript_text &gt;200 chars. Depois clica &quot;Re-gerar IA&quot; no banner da edit.
              </>
            }
          />
          <GuideProblemCard
            severity="low"
            problem="Sugestões consistentemente ruins"
            signs="GPT sugere títulos vagos, classifica structure errado, price tier sempre 'unknown'."
            cause="Prompt atual não captura bem o teu critério de qualidade."
            solution={
              <>
                Edita o <strong>system prompt</strong> em{" "}
                <Link href="/admin/ai-suggest/config" className="text-[var(--accent)] hover:underline">
                  /admin/ai-suggest/config
                </Link>
                . Adiciona exemplos do que é bom e ruim (few-shot). Depois clica &quot;Re-gerar&quot; em bulk pra 5-10 ofertas e compara o resultado.
              </>
            }
          />
        </div>
      </GuideSection>

      {/* ── 7. Banco lento ── */}
      <GuideSection
        icon={<Database size={16} strokeWidth={1.8} />}
        iconColor="#10B981"
        title="7. Páginas admin abrindo devagar"
      >
        <GuideProblemCard
          severity="low"
          problem="/admin/meta-api ou /admin/logs demoram &gt;3s pra carregar"
          signs="Queries do dashboard acumulam volume conforme catálogo cresce."
          cause="Falta de indexes específicos, ou queries pesadas sem paginação."
          solution={
            <>
              Verifica se as migrations de perf_indexes foram aplicadas. Lista no banco:{" "}
              <GuideKbd>select indexname from pg_indexes where indexname like &#39;idx_%&#39;</GuideKbd>
              . Devem existir ~18 indexes com prefixo{" "}
              <GuideKbd>idx_</GuideKbd>. Se faltam, aplica{" "}
              <GuideKbd>20260420000003_perf_indexes.sql</GuideKbd>.
            </>
          }
        />
      </GuideSection>

      {/* ── Rodapé ── */}
      <section
        className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3"
        style={{ borderLeft: "3px solid var(--text-3)" }}
      >
        <AlertCircle
          size={16}
          strokeWidth={1.8}
          className="text-text-3 mt-0.5 shrink-0"
        />
        <div className="flex flex-col gap-1 text-[12.5px] text-text-2 leading-relaxed">
          <p className="text-text font-medium">
            Nenhum desses resolveu?
          </p>
          <p>
            Abre o <Link href="/admin/logs" className="text-[var(--accent)] hover:underline">/admin/logs</Link>{" "}
            filtrando por &quot;só erros&quot; e me manda as 3-5 últimas linhas com timestamp.
            90% dos casos o erro técnico dá o caminho do que fazer.
          </p>
          <div className="flex flex-col gap-1 pt-1">
            <Link href="/admin/guias/meta-api" className="hover:text-text inline-flex items-center gap-1">
              <ExternalLink size={10} strokeWidth={1.8} />
              Guia específico de Meta API
            </Link>
            <Link href="/admin/guias/workers" className="hover:text-text inline-flex items-center gap-1">
              <ExternalLink size={10} strokeWidth={1.8} />
              Guia de workers (o que cada um faz)
            </Link>
          </div>
        </div>
      </section>

      <div className="h-12" aria-hidden />
    </div>
  );
}
