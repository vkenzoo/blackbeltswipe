import Link from "next/link";
import {
  ChevronLeft,
  Globe,
  Camera,
  Video,
  Image as ImageIcon,
  Mic,
  RefreshCw,
  TrendingUp,
  Search,
  Info,
  Clock,
  DollarSign,
  Zap,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";

// Conteúdo de guia estático — Next cacheia normalmente.

/**
 * /admin/workers/guia
 *
 * Guia explicativo pra admins leigos entenderem o que cada worker faz,
 * quando roda, quanto custa, e o que acontece quando algo falha.
 *
 * Cada "worker" é um tipo de tarefa (job kind) que o processo de automação
 * executa em background. Não é um processo separado.
 */

type WorkerGuide = {
  emoji: string;
  icon: React.ReactNode;
  color: string;
  kind: string; // identificador técnico
  nome: string;
  o_que_faz: string;
  quando_roda: string;
  tempo_medio: string;
  custo: string;
  sinais_ok: string;
  quando_falha: string;
};

const WORKERS: WorkerGuide[] = [
  {
    emoji: "🌐",
    icon: <Globe size={18} strokeWidth={1.8} />,
    color: "#8B5CF6",
    kind: "enrich_from_url",
    nome: "Enriquecer oferta (URL nova)",
    o_que_faz:
      "Quando você cola uma URL de site ou Ad Library no formulário admin, esse worker visita a página como se fosse um navegador real, tira screenshots, identifica vídeos VSL, extrai criativos publicitários e transcreve áudios.",
    quando_roda:
      "Dispara automaticamente ao cadastrar uma oferta nova via URL. Pode levar até 30min em ofertas complexas com VSL longa.",
    tempo_medio: "30s a 15min",
    custo: "~$0.01 por oferta (GPT-4o-mini pra classificar nicho)",
    sinais_ok:
      "Oferta aparece com título correto, thumbnail, até 5 criativos, URL de VSL e transcrição.",
    quando_falha:
      "Fica como 'Erro' na lista de workers. Admin pode clicar 'Retry' pra tentar de novo.",
  },
  {
    emoji: "🔧",
    icon: <RefreshCw size={18} strokeWidth={1.8} />,
    color: "#8B5CF6",
    kind: "enrich_offer",
    nome: "Re-enriquecer oferta existente",
    o_que_faz:
      "Mesmo que o anterior, mas pra ofertas JÁ cadastradas. Útil quando o advertiser atualiza o site, sobe novos criativos, ou quando você quer atualizar os dados da oferta.",
    quando_roda:
      "Quando admin clica em 'Atualizar agora' na página de edição da oferta.",
    tempo_medio: "30s a 15min",
    custo: "~$0.01 por oferta",
    sinais_ok:
      "Criativos novos aparecem, screenshot atualiza, eventual transcrição nova.",
    quando_falha: "Mesma situação do enrich_from_url — retry disponível.",
  },
  {
    emoji: "📸",
    icon: <Camera size={18} strokeWidth={1.8} />,
    color: "#06B6D4",
    kind: "screenshot_page",
    nome: "Tirar screenshot da página",
    o_que_faz:
      "Abre a URL em um navegador automático (Chrome headless), espera carregar tudo, e salva uma imagem full-page (da altura inteira do site).",
    quando_roda:
      "Automático quando você adiciona uma URL nova. Também tem varredura diária que pega páginas sem screenshot.",
    tempo_medio: "10-30s por página",
    custo: "Zero (só CPU)",
    sinais_ok:
      "Card da oferta mostra screenshot da landing page. Preview clicável nas páginas vinculadas.",
    quando_falha:
      "Ficar pendente várias horas geralmente significa FB/Meta bloqueou. Retry automático 3x com delays crescentes.",
  },
  {
    emoji: "🎬",
    icon: <Video size={18} strokeWidth={1.8} />,
    color: "#10B981",
    kind: "extract_vsl",
    nome: "Extrair vídeo VSL",
    o_que_faz:
      "Detecta o player de vídeo na landing (ConverteAI, VTurb, Panda Video, etc) e baixa o MP4 completo da VSL. Se for HLS streaming, converte em MP4 pra poder salvar.",
    quando_roda:
      "Parte do enriquecimento quando detecta VSL. Pode também ser disparado manualmente.",
    tempo_medio: "5-30min (HLS re-encode é pesado)",
    custo: "Zero (ffmpeg local)",
    sinais_ok:
      "Detail page mostra VSL completa embedada em player próprio, sem depender do site original.",
    quando_falha:
      "Algumas VSLs têm proteção DRM ou URLs efêmeras que expiram. Nesses casos, trocar a URL e re-enriquecer.",
  },
  {
    emoji: "🖼",
    icon: <ImageIcon size={18} strokeWidth={1.8} />,
    color: "#10B981",
    kind: "generate_thumb",
    nome: "Gerar thumbnail",
    o_que_faz:
      "Extrai um frame do vídeo aos 3 segundos pra servir de preview antes do play. Usado em cards, detail pages e galeria.",
    quando_roda:
      "Automático após download de vídeo (VSL ou criativo).",
    tempo_medio: "5-10s",
    custo: "Zero (ffmpeg local)",
    sinais_ok: "Preview aparece em todos os cards onde antes era placeholder.",
    quando_falha: "Raro. Geralmente vídeo corrompido.",
  },
  {
    emoji: "🎤",
    icon: <Mic size={18} strokeWidth={1.8} />,
    color: "#EC4899",
    kind: "transcribe_vsl",
    nome: "Transcrever VSL (Whisper)",
    o_que_faz:
      "Envia o áudio da VSL pro OpenAI Whisper (melhor modelo de speech-to-text do mercado). Salva a transcrição estruturada com timestamps pra exibir na detail page.",
    quando_roda:
      "Automático após extract_vsl conseguir baixar o MP4. Varredura diária pega VSLs sem transcrição.",
    tempo_medio: "5-20min (depende do comprimento do VSL)",
    custo:
      "$0.006 por minuto de áudio (≈ $0.06-0.12 por VSL de 10-20min)",
    sinais_ok:
      "Detail page tem aba 'Transcrição' com texto completo + botão de download.",
    quando_falha:
      "Falha geralmente é por áudio silencioso ou rate limit da OpenAI. Retry resolve.",
  },
  {
    emoji: "🎙",
    icon: <Mic size={18} strokeWidth={1.8} />,
    color: "#EC4899",
    kind: "transcribe_creative",
    nome: "Transcrever criativo publicitário",
    o_que_faz:
      "Igual ao transcribe_vsl mas pra ads curtos (15-60s). Permite busca de copy e download de transcrição individual.",
    quando_roda:
      "Automático quando um novo criativo video é baixado. Varredura diária enfileira os que faltam.",
    tempo_medio: "30s a 2min por criativo",
    custo: "$0.006 por minuto (≈ $0.003-0.01 por criativo)",
    sinais_ok:
      "Botão 'Baixar transcrição' aparece no card do criativo em vez de 'Transcrever'.",
    quando_falha: "Retry automático. Se persistir, revisa asset_url.",
  },
  {
    emoji: "🔄",
    icon: <RefreshCw size={18} strokeWidth={1.8} />,
    color: "#06B6D4",
    kind: "refresh_ad_count",
    nome: "Atualizar contagem de anúncios",
    o_que_faz:
      "Consulta Meta Ad Library via API oficial (ou scraping de fallback), conta quantos ads ATIVOS a oferta tem no momento, detecta ads novos, marca ads que foram pausados. Baixa até 20 vídeos e 10 imagens por oferta pra manter a biblioteca atualizada.",
    quando_roda:
      "A cada 1 hora o sistema verifica ofertas que precisam de refresh. Frequência adaptativa por oferta: 🔥 escalando → 6h · 🌡 normal → 24h · ❄️ fria → 7d · ⚰️ morta → 30d.",
    tempo_medio: "30s a 5min por oferta",
    custo:
      "Zero na API (gratuita até 200 calls/hora). Tempo de Playwright pra baixar vídeos.",
    sinais_ok:
      "Contagem de ads no card atualiza. Sparkline 30d começa a formar a curva. Novos criativos aparecem na /app/criativos.",
    quando_falha:
      "Meta pode retornar erro se page_id está inválido. Layer 3 (domain search) tenta descobrir Pages novas automaticamente.",
  },
  {
    emoji: "📊",
    icon: <TrendingUp size={18} strokeWidth={1.8} />,
    color: "#F59E0B",
    kind: "compute_scale_score",
    nome: "Calcular score de escala",
    o_que_faz:
      "Calcula score 0-100 da oferta usando fórmula ponderada: ad_count absoluto (30%) + crescimento 7d (30%) + velocidade de criativos (20%) + longevidade (20%). Define trend (rising/steady/cooling/dead) e auto-pausa ofertas com 3+ dias zero.",
    quando_roda:
      "Automático após cada refresh_ad_count. Varredura 24h recomputa scores usando snapshots históricos.",
    tempo_medio: "< 1 segundo",
    custo: "Zero (pura matemática SQL)",
    sinais_ok:
      "Badge colorido aparece nos cards (🔥 escalando, 📈 subindo, 🌡 steady, ❄️ cooling, ⚰️ morta). Velocity% mostra % de mudança em 7d.",
    quando_falha: "Raro. Só se não tiver snapshots suficientes pra calcular.",
  },
  {
    emoji: "🔍",
    icon: <Search size={18} strokeWidth={1.8} />,
    color: "#67E8F9",
    kind: "domain_discovery",
    nome: "Descoberta de Pages por domínio",
    o_que_faz:
      "Varre semanalmente TODAS as ofertas com site principal cadastrado. Busca na Meta Ad Library por aquele domínio e descobre se o advertiser tem MAIS DE UMA Page rodando ads (casos tipo Paulo Borges). Cadastra as Pages novas automaticamente.",
    quando_roda:
      "Gate de 7 dias. Roda 1x por semana no boot do worker após 7 dias da última execução.",
    tempo_medio: "5-10min pra escanear 20 ofertas",
    custo: "Zero (API + Playwright)",
    sinais_ok:
      "No card 'URLs monitoradas' do admin, aparece badge cyan 📡 nas pages descobertas automaticamente.",
    quando_falha:
      "Skipa ofertas sem main_site cadastrado. Admin precisa adicionar URL de landing pra ativar.",
  },
];

export default async function WorkersGuiaPage() {
  await requireAdmin();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1200px] mx-auto">
      <Link
        href="/admin/guias"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit -mb-2"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar pra Central de guias
      </Link>

      <header className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
          Como funcionam os workers
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.03em] leading-tight">
          Os 10 workers que mantém o Black Belt Swipe rodando
        </h1>
        <p className="text-[14px] text-text-2 max-w-[760px] leading-relaxed">
          Workers são tarefas automáticas que rodam em background pra extrair,
          atualizar e enriquecer os dados das ofertas. Cada um tem uma função
          específica e roda em momentos diferentes. Aqui você entende o que
          cada um faz, quando dispara, quanto custa e como saber se tá
          funcionando.
        </p>
      </header>

      {/* How it works — visão geral */}
      <section
        className="glass rounded-[var(--r-lg)] p-5 flex items-start gap-3"
        style={{ borderColor: "color-mix(in srgb, #8B5CF6 40%, transparent)" }}
      >
        <Info
          size={18}
          strokeWidth={1.8}
          style={{ color: "#A78BFA" }}
          className="mt-0.5 shrink-0"
        />
        <div className="flex flex-col gap-2">
          <h2 className="display text-[15px] font-semibold tracking-[-0.01em]">
            Como o sistema decide o que rodar
          </h2>
          <p className="text-[12.5px] text-text-2 leading-relaxed">
            O worker é UM único processo rodando 24/7. Ele tem uma <span className="mono text-text">fila de tarefas</span>{" "}
            (tabela <span className="mono text-text">jobs</span>) e pega tarefas
            conforme vão chegando — respeitando limites de concorrência pra não
            sobrecarregar. Por exemplo: até 3 atualizações de contagem em
            paralelo, 5 screenshots, mas só 1 transcrição por vez (limite
            OpenAI).
          </p>
          <p className="text-[12.5px] text-text-2 leading-relaxed">
            Novas tarefas entram na fila por 3 caminhos:{" "}
            <strong className="text-text">(1) admin</strong> ao cadastrar
            oferta ou clicar botão,{" "}
            <strong className="text-text">(2) sweeps</strong> (varreduras
            periódicas que verificam o que tá defasado) ou{" "}
            <strong className="text-text">(3) outros workers</strong> (ex: após
            baixar um criativo, enfileira transcrição auto).
          </p>
        </div>
      </section>

      {/* Cards de cada worker */}
      <div className="grid gap-3">
        {WORKERS.map((w) => (
          <WorkerCard key={w.kind} worker={w} />
        ))}
      </div>

      {/* Rodapé — o que fazer quando algo falha */}
      <section className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3">
        <h2 className="display text-[15px] font-semibold tracking-[-0.01em]">
          🚨 O que fazer quando algo falha
        </h2>
        <ul className="flex flex-col gap-2 text-[12.5px] text-text-2 leading-relaxed">
          <li>
            <strong className="text-text">• Status vermelho (erro)</strong> →
            clica no botão <span className="mono text-text">Retry</span> ao
            lado. O worker tenta 3× com delays crescentes (30s → 2min → 10min)
            antes de marcar como erro permanente.
          </li>
          <li>
            <strong className="text-text">• Worker parado (STALE/DEAD)</strong>{" "}
            → o processo principal pode ter morrido. Isso é raro, mas
            acontece. Solução: reiniciar o worker no servidor (comando:{" "}
            <span className="mono text-text">bun run worker/index.ts</span>).
          </li>
          <li>
            <strong className="text-text">• Custos subindo muito</strong> →
            abre o Breakdown por tipo pra ver qual worker tá gastando mais.
            Geralmente é transcribe_vsl (Whisper). Considera desabilitar
            temporariamente se não precisar.
          </li>
          <li>
            <strong className="text-text">• Ofertas sem atualização</strong> →
            pode ser que não têm URL de Ad Library cadastrada, ou que o
            advertiser mudou de Page. Usa o botão{" "}
            <span className="text-[#67E8F9]">
              🔍 Descobrir pages
            </span>{" "}
            no admin da oferta.
          </li>
        </ul>
      </section>
    </div>
  );
}

function WorkerCard({ worker: w }: { worker: WorkerGuide }) {
  return (
    <article
      className="glass rounded-[var(--r-lg)] overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${w.color} 30%, transparent)`,
      }}
    >
      {/* Header colorido */}
      <header
        className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center gap-3"
        style={{
          background: `color-mix(in srgb, ${w.color} 7%, transparent)`,
        }}
      >
        <div
          className="w-10 h-10 rounded-[var(--r-sm)] grid place-items-center shrink-0"
          style={{
            background: `color-mix(in srgb, ${w.color} 20%, transparent)`,
            color: w.color,
          }}
        >
          {w.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="display text-[17px] font-semibold tracking-[-0.01em] leading-tight"
            style={{ color: w.color }}
          >
            {w.emoji} {w.nome}
          </h3>
          <code className="mono text-[11px] text-text-3">{w.kind}</code>
        </div>
      </header>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-1">
            O que faz
          </div>
          <p className="text-[13px] text-text-2 leading-relaxed">{w.o_que_faz}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <InfoPill icon={<Clock size={11} />} label="Quando roda" value={w.quando_roda} />
          <InfoPill icon={<Zap size={11} />} label="Tempo médio" value={w.tempo_medio} />
          <InfoPill icon={<DollarSign size={11} />} label="Custo" value={w.custo} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-hairline)]">
          <div>
            <div className="text-[11px] font-semibold text-[var(--success)] uppercase tracking-wider mb-1">
              ✅ Quando tá funcionando
            </div>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              {w.sinais_ok}
            </p>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--error)] uppercase tracking-wider mb-1">
              ⚠️ Quando algo dá errado
            </div>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              {w.quando_falha}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function InfoPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-text-3 uppercase tracking-wider">
        <span className="text-text-3">{icon}</span>
        {label}
      </span>
      <span className="text-[12px] text-text-2 leading-tight">{value}</span>
    </div>
  );
}
