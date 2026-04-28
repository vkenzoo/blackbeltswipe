"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Check,
  Loader2,
  Upload,
  Film,
  X,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Plus,
  RefreshCw,
  Link as LinkIcon,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Video,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  type Niche,
  type Language,
  type OfferStructure,
  type TrafficSource,
  type Offer,
  type CreativeKind,
} from "@/lib/types";
import {
  uploadVsl,
  getVideoDuration,
  generateVideoThumbnail,
  uploadThumbnail,
  uploadCreativeAsset,
  uploadCreativeThumb,
} from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import { SkeletonEditForm } from "@/components/ui/skeleton";
import { AiDraftBanner } from "@/components/admin/ai-draft-banner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { AdLibraryMonitorCard } from "@/components/admin/ad-library-monitor-card";

// ────────────────────────────────────────────────────────────
// styles
// ────────────────────────────────────────────────────────────

const inputStyle = `
  w-full px-3.5 py-2.5 rounded-[var(--r-md)]
  bg-black/30 border border-[var(--border-default)]
  text-[14px] text-text placeholder:text-text-3
  transition-[border-color,background] duration-200
  focus:outline-none focus:border-[var(--accent)]
  focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
`;
const labelStyle =
  "block text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-2";

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const TRANSCRIBE_STAGES = [
  "Baixando VSL do Storage...",
  "Convertendo áudio (ffmpeg → mp3 mono 16kHz)...",
  "Enviando pra Whisper API...",
  "Whisper transcrevendo segmentos...",
  "Processando texto final...",
];

type PageRow = {
  id: string;
  url: string;
  type: string;
  screenshot_url: string | null;
  fetched_at: string | null;
  title: string | null;
  visible: boolean;
  display_order: number;
};

type CreativeRow = {
  id: string;
  kind: CreativeKind;
  asset_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  captured_at: string;
  caption: string | null;
  published_at: string | null;
  visible: boolean;
  display_order: number;
};

type LoadedData = { offer: Offer; pages: PageRow[]; creatives: CreativeRow[] };

/** Page item no estado do form (editável client-side). */
type PageFormRow = {
  id?: string; // existe se já persistida
  url: string;
  title: string;
  visible: boolean;
  screenshot_url?: string | null;
  fetched_at?: string | null;
};

// ────────────────────────────────────────────────────────────
// page
// ────────────────────────────────────────────────────────────

export default function EditOfferPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [niche, setNiche] = useState<Niche>("renda_extra");
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [structure, setStructure] = useState<OfferStructure>("vsl");
  const [trafficSource, setTrafficSource] = useState<TrafficSource>("facebook");
  const [status, setStatus] = useState<"active" | "paused" | "draft">("draft");
  const [adCount, setAdCount] = useState<string>("0");
  const [flagsText, setFlagsText] = useState("");
  const [pageRows, setPageRows] = useState<PageFormRow[]>([]);
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);

  // modal state pra adicionar criativo
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);

  // worker states pra ações isoladas
  const [workerState, setWorkerState] = useState<{
    extractVsl?: "running" | "done" | "error";
    genThumb?: "running" | "done" | "error";
    transcribe?: "running" | "done" | "error";
    uploadThumb?: "running" | "done" | "error";
    screenshotPageId?: string | null;
  }>({});
  const [workerMsg, setWorkerMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");

  // Transcribe stage animation (cicla frases enquanto Whisper processa)
  const [transcribeStage, setTranscribeStage] = useState(0);
  const [transcribeElapsed, setTranscribeElapsed] = useState(0);
  useEffect(() => {
    if (workerState.transcribe !== "running") {
      setTranscribeStage(0);
      setTranscribeElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setTranscribeElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setTranscribeStage((s) => (s + 1) % TRANSCRIBE_STAGES.length);
    }, 2500);
    return () => clearInterval(tick);
  }, [workerState.transcribe]);

  // ────────────────────────────────────────────────────────────────
  // Sync workerState com jobs ATIVOS do DB.
  // Resolve bug: se user refresh da página enquanto job rola, banner
  // "Worker extraindo..." sumia porque workerState era React-only.
  // Agora poll a cada 3s e reflete estado real.
  // ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    let lastMsg: string | null = null;

    async function pollActiveJobs() {
      try {
        const res = await fetch(`/api/admin/offers/${params.id}/active-jobs`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          jobs: Array<{
            id: string;
            kind: string;
            status: "pending" | "running";
            elapsed_seconds: number;
          }>;
          has_running: boolean;
        };
        if (cancelled) return;

        const runningKinds = new Set(
          data.jobs.filter((j) => j.status === "running").map((j) => j.kind)
        );
        const pendingKinds = new Set(
          data.jobs.filter((j) => j.status === "pending").map((j) => j.kind)
        );

        // Sincroniza workerState com jobs do DB
        setWorkerState((s) => ({
          ...s,
          extractVsl: runningKinds.has("extract_vsl")
            ? "running"
            : s.extractVsl === "running"
              ? undefined
              : s.extractVsl,
          genThumb: runningKinds.has("generate_thumb")
            ? "running"
            : s.genThumb === "running"
              ? undefined
              : s.genThumb,
          transcribe:
            runningKinds.has("transcribe_vsl") ||
            runningKinds.has("transcribe_creative")
              ? "running"
              : s.transcribe === "running"
                ? undefined
                : s.transcribe,
        }));

        // Mensagem derivada do estado — prioridade: running > pending
        // (a mais "avançada" no pipeline vence)
        let msg: string | null = null;
        if (runningKinds.has("ai_authoring")) {
          msg = "AI gerando draft com GPT-4o-mini...";
        } else if (runningKinds.has("transcribe_vsl")) {
          msg = "Whisper transcrevendo VSL (pode levar 2-5min)...";
        } else if (runningKinds.has("generate_thumb")) {
          msg = "Gerando thumb do VSL...";
        } else if (runningKinds.has("extract_vsl")) {
          const job = data.jobs.find(
            (j) => j.kind === "extract_vsl" && j.status === "running"
          );
          const elapsed = job?.elapsed_seconds ?? 0;
          msg = `Worker extraindo VSL da landing (${elapsed}s)...`;
        } else if (runningKinds.has("enrich_from_url")) {
          msg = "Enriquecendo oferta (Playwright)...";
        } else if (runningKinds.has("refresh_ad_count")) {
          msg = "Atualizando contagem de ads...";
        } else if (
          pendingKinds.has("extract_vsl") ||
          pendingKinds.has("transcribe_vsl") ||
          pendingKinds.has("ai_authoring")
        ) {
          msg = "Job enfileirado, aguardando worker...";
        }

        // Só atualiza se mudou e se não há mensagem local prioritária de sucesso/erro
        if (msg !== lastMsg) {
          // Preserva mensagens locais de sucesso (✓) ou erro do user action
          setWorkerMsg((current) => {
            if (current?.startsWith("VSL extraída") || current?.includes("✓")) {
              return current;
            }
            return msg;
          });
          lastMsg = msg;
        }

        // Se terminou tudo, também limpa o workerMsg residual de polling
        if (!data.has_running && !msg) {
          setWorkerMsg((current) => {
            // Mantém só mensagens locais (✓ ou erro); limpa mensagens de polling
            if (current?.includes("...")) return null;
            return current;
          });
        }
      } catch {
        /* silent — network glitch não deve quebrar UI */
      }
    }

    pollActiveJobs(); // fire imediato no mount
    const interval = setInterval(pollActiveJobs, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.id]);

  // worker enrichment state
  const [enrichUrl, setEnrichUrl] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{
    ok: boolean;
    pageType?: string;
    adCount?: number | null;
    creativesCreated?: number;
    landingPagesCreated?: number;
    checkoutPagesCreated?: number;
    error?: string;
    debug?: {
      mediaFound: number;
      graphqlHits: number;
      domVideosFound: number;
      domImagesFound: number;
      interceptedMp4s: number;
      interceptedImages: number;
      landingUrlsFound?: number;
    };
  } | null>(null);

  // VSL replacement state
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceDuration, setReplaceDuration] = useState<number | null>(null);
  const [replacePct, setReplacePct] = useState(0);
  const [replacingVsl, setReplacingVsl] = useState(false);

  // signed URL for preview
  const [vslUrl, setVslUrl] = useState<string | null>(null);

  // submit state
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // load initial data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/offers/${params.id}`);
        if (!res.ok) {
          setLoadErr(res.status === 404 ? "Oferta não encontrada" : `HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as LoadedData;
        setLoaded(data);
        const o = data.offer;
        setTitle(o.title);
        setSlug(o.slug);
        setNiche(o.niche);
        setLanguage(o.language);
        setStructure(o.structure);
        setTrafficSource(o.traffic_source);
        setStatus(o.status);
        setAdCount(String(o.ad_count ?? 0));
        setFlagsText((o.flags ?? []).join(", "));
        setPageRows(
          data.pages
            .sort((a, b) => a.display_order - b.display_order)
            .map((p) => ({
              id: p.id,
              url: p.url,
              title: p.title ?? "",
              visible: p.visible,
              screenshot_url: p.screenshot_url,
              fetched_at: p.fetched_at,
            }))
        );
        setCreatives(data.creatives ?? []);
        setTranscriptDraft(o.transcript_text ?? o.transcript_preview ?? "");

        // Fetch signed URL pra preview se VSL existe
        if (o.vsl_storage_path) {
          fetch(`/api/offer/${o.slug}/vsl-url`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { url?: string } | null) => d?.url && setVslUrl(d.url))
            .catch(() => {});
        }
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "erro ao carregar");
      }
    })();
  }, [params.id]);

  // ────────────────────────────────────────────────────────
  // VSL replacement

  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReplaceFile(f);
    try {
      const d = await getVideoDuration(f);
      setReplaceDuration(d);
    } catch {
      setReplaceDuration(null);
    }
  }

  async function executeReplaceVsl() {
    if (!loaded || !replaceFile) return;
    setReplacingVsl(true);
    setErrorMsg(null);
    try {
      // thumb nova (best-effort)
      let thumbPath: string | null = null;
      try {
        const blob = await generateVideoThumbnail(replaceFile, 3);
        thumbPath = await uploadThumbnail(slug, blob);
      } catch (err) {
        console.warn("thumb replace falhou:", err);
      }

      // mp4 novo (upload sobrescreve o path antigo se for mesmo slug)
      const { path, sizeBytes } = await uploadVsl(
        slug,
        replaceFile,
        (pct) => setReplacePct(pct)
      );

      // PATCH offer com novos campos VSL
      const res = await fetch(`/api/admin/offers/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vsl_storage_path: path,
          vsl_thumbnail_path: thumbPath ?? loaded.offer.vsl_thumbnail_path,
          vsl_size_bytes: sizeBytes,
          vsl_duration_seconds: replaceDuration,
          vsl_uploaded_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      setSuccessMsg("VSL substituída");
      setReplaceFile(null);
      setReplaceDuration(null);
      setReplacePct(0);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // re-load signed URL
      const newSigned = await fetch(`/api/offer/${slug}/vsl-url`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (newSigned?.url) setVslUrl(newSigned.url);
      // invalidate cache
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "erro ao substituir VSL");
    } finally {
      setReplacingVsl(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // Pages management

  function addPageRow() {
    setPageRows((prev) => [...prev, { url: "", title: "", visible: true }]);
  }
  function updatePageAt(i: number, patch: Partial<PageFormRow>) {
    setPageRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removePageAt(i: number) {
    setPageRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function movePage(i: number, dir: -1 | 1) {
    setPageRows((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // ────────────────────────────────────────────────────────
  // Creatives management

  async function toggleCreativeVisible(c: CreativeRow) {
    const newVisible = !c.visible;
    setCreatives((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, visible: newVisible } : x))
    );
    const res = await fetch(`/api/admin/creatives/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: newVisible }),
    });
    if (!res.ok) {
      // revert
      setCreatives((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, visible: c.visible } : x))
      );
      setErrorMsg("falha ao atualizar visibilidade");
    }
  }

  async function removeCreative(c: CreativeRow) {
    if (!confirm(`Remover esse criativo? ${c.caption ? `"${c.caption.slice(0, 40)}..."` : ""}`)) return;
    setCreatives((prev) => prev.filter((x) => x.id !== c.id));
    const res = await fetch(`/api/admin/creatives/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      setErrorMsg("falha ao remover criativo");
      // re-fetch pra restaurar estado
      reloadCreatives();
    }
  }

  async function moveCreative(c: CreativeRow, dir: -1 | 1) {
    const sorted = [...creatives].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((x) => x.id === c.id);
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    const newOrderC = other.display_order;
    const newOrderOther = c.display_order;

    // optimistic
    setCreatives((prev) =>
      prev.map((x) => {
        if (x.id === c.id) return { ...x, display_order: newOrderC };
        if (x.id === other.id) return { ...x, display_order: newOrderOther };
        return x;
      })
    );

    await Promise.all([
      fetch(`/api/admin/creatives/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_order: newOrderC }),
      }),
      fetch(`/api/admin/creatives/${other.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_order: newOrderOther }),
      }),
    ]);
  }

  async function reloadCreatives() {
    const res = await fetch(`/api/admin/offers/${params.id}`);
    if (res.ok) {
      const data = (await res.json()) as LoadedData;
      setCreatives(data.creatives ?? []);
      setLoaded(data);
      // also sync form pages in case worker added
      setPageRows(
        data.pages
          .sort((a, b) => a.display_order - b.display_order)
          .map((p) => ({
            id: p.id,
            url: p.url,
            title: p.title ?? "",
            visible: p.visible,
          }))
      );
    }
  }

  async function runEnrichment() {
    if (!enrichUrl.trim() || enriching) return;
    setEnriching(true);
    setEnrichResult(null);
    try {
      const res = await fetch(`/api/admin/offers/${params.id}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: enrichUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnrichResult({ ok: false, error: data.error ?? `HTTP ${res.status}` });
      } else {
        setEnrichResult({
          ok: true,
          pageType: data.pageType,
          adCount: data.adCount,
          creativesCreated: data.creativesCreated,
          landingPagesCreated: data.landingPagesCreated,
          checkoutPagesCreated: data.checkoutPagesCreated,
          debug: data.debug,
        });
        // Refetch tudo pra mostrar novos criativos/pages
        await reloadCreatives();
        setEnrichUrl(""); // limpa input pra próxima
      }
    } catch (err) {
      setEnrichResult({
        ok: false,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    } finally {
      setEnriching(false);
    }
  }

  async function handleCreativeCreated(c: CreativeRow) {
    setCreatives((prev) => [...prev, c].sort((a, b) => a.display_order - b.display_order));
    setCreativeModalOpen(false);
  }

  // ────────────────────────────────────────────────────────
  // Worker actions

  async function pollJob(jobId: string, timeoutMs = 600_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/admin/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) continue;
      const job = await res.json();
      if (job.status === "done") return;
      if (job.status === "error") throw new Error(job.error ?? "worker_error");
    }
    throw new Error("job_timeout");
  }

  async function runGenThumb(source: "vsl" | "creative", creativeId?: string) {
    setWorkerState((s) => ({ ...s, genThumb: "running" }));
    setWorkerMsg("Enfileirando job...");
    try {
      const res = await fetch(`/api/admin/offers/${params.id}/generate-thumb`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, creativeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkerMsg("Worker gerando thumb...");
      await pollJob(data.job_id);
      setWorkerState((s) => ({ ...s, genThumb: "done" }));
      setWorkerMsg(`Thumb atualizada ✓`);
      setTimeout(() => setWorkerMsg(null), 3000);
      await reloadCreatives();
      router.refresh();
    } catch (err) {
      setWorkerState((s) => ({ ...s, genThumb: "error" }));
      setWorkerMsg(err instanceof Error ? err.message : "erro");
    }
  }

  async function runExtractVsl(landingUrl: string, transcribe: boolean) {
    setWorkerState((s) => ({ ...s, extractVsl: "running" }));
    setWorkerMsg("Enfileirando extração...");
    try {
      const res = await fetch(`/api/admin/offers/${params.id}/extract-vsl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ landingUrl, transcribe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkerMsg(
        transcribe
          ? "Worker extraindo VSL + transcrevendo (pode levar 2-4min)..."
          : "Worker extraindo VSL (pode levar 1-3min)..."
      );
      await pollJob(data.job_id);
      setWorkerState((s) => ({ ...s, extractVsl: "done" }));
      setWorkerMsg(`VSL extraída ✓`);
      setTimeout(() => setWorkerMsg(null), 4000);
      await reloadCreatives();
      router.refresh();
    } catch (err) {
      setWorkerState((s) => ({ ...s, extractVsl: "error" }));
      setWorkerMsg(err instanceof Error ? err.message : "erro");
    }
  }

  async function runTranscribe() {
    setWorkerState((s) => ({ ...s, transcribe: "running" }));
    setWorkerMsg("Enfileirando transcrição...");
    try {
      const res = await fetch(`/api/admin/offers/${params.id}/transcribe`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkerMsg("Worker transcrevendo via Whisper...");
      await pollJob(data.job_id);
      setWorkerState((s) => ({ ...s, transcribe: "done" }));
      setWorkerMsg(`Transcrita ✓`);
      setTimeout(() => setWorkerMsg(null), 3000);
      await reloadCreatives();
    } catch (err) {
      setWorkerState((s) => ({ ...s, transcribe: "error" }));
      setWorkerMsg(err instanceof Error ? err.message : "erro");
    }
  }

  async function runScreenshotPage(pageId: string) {
    setWorkerState((s) => ({ ...s, screenshotPageId: pageId }));
    setWorkerMsg("Enfileirando screenshot...");
    try {
      const res = await fetch(`/api/admin/pages/${pageId}/screenshot`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkerMsg("Worker capturando screenshot...");
      await pollJob(data.job_id);
      setWorkerState((s) => ({ ...s, screenshotPageId: null }));
      setWorkerMsg(`Print salvo ✓`);
      setTimeout(() => setWorkerMsg(null), 3000);

      // Refetch as pages pra atualizar screenshot_url
      const getRes = await fetch(`/api/admin/offers/${params.id}`);
      if (getRes.ok) {
        const fresh = (await getRes.json()) as LoadedData;
        setPageRows(
          fresh.pages
            .sort((a, b) => a.display_order - b.display_order)
            .map((p) => ({
              id: p.id,
              url: p.url,
              title: p.title ?? "",
              visible: p.visible,
              screenshot_url: p.screenshot_url,
              fetched_at: p.fetched_at,
            }))
        );
      }
    } catch (err) {
      setWorkerState((s) => ({ ...s, screenshotPageId: null }));
      setWorkerMsg(err instanceof Error ? err.message : "erro");
    }
  }

  async function saveTranscriptDraft() {
    const res = await fetch(`/api/admin/offers/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript_text: transcriptDraft,
        transcript_preview:
          transcriptDraft.length > 500
            ? transcriptDraft.slice(0, transcriptDraft.lastIndexOf(" ", 500)).trim() + "…"
            : transcriptDraft,
      }),
    });
    if (res.ok) {
      setWorkerMsg("Transcrição salva ✓");
      setTimeout(() => setWorkerMsg(null), 2500);
    } else {
      setWorkerMsg("Falha ao salvar transcrição");
    }
  }

  async function uploadManualThumb(file: File) {
    if (!loaded) return;
    console.log("[uploadManualThumb] start", {
      name: file.name,
      size: file.size,
      type: file.type,
      slug: loaded.offer.slug,
    });
    setWorkerState((s) => ({ ...s, uploadThumb: "running" }));
    setWorkerMsg("Enviando thumb...");
    setErrorMsg(null);

    // Validação client-side: tamanho e mime
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setWorkerState((s) => ({ ...s, uploadThumb: "error" }));
      setWorkerMsg(null);
      setErrorMsg(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB (limite 5MB)`);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setWorkerState((s) => ({ ...s, uploadThumb: "error" }));
      setWorkerMsg(null);
      setErrorMsg(
        `Formato não suportado: ${file.type || "desconhecido"}. Use JPEG, PNG ou WebP.`
      );
      return;
    }

    const oldPath = loaded.offer.vsl_thumbnail_path;

    try {
      const { uploadThumbnail, deleteThumbnail } = await import("@/lib/storage");
      console.log("[uploadManualThumb] subindo pra storage...");
      const path = await uploadThumbnail(loaded.offer.slug, file);
      console.log("[uploadManualThumb] storage OK, path=", path);

      // PATCH offer com path novo (cache-bust vem do filename com timestamp)
      console.log("[uploadManualThumb] PATCH offer...");
      const res = await fetch(`/api/admin/offers/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vsl_thumbnail_path: path }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error("[uploadManualThumb] PATCH falhou:", res.status, errJson);
        // Rollback: remove o novo thumb que acabamos de subir
        await deleteThumbnail(path);
        throw new Error(errJson.error ?? `PATCH falhou (HTTP ${res.status})`);
      }

      // Cleanup: remove thumb anterior (best-effort, não crítico se falhar)
      if (oldPath && oldPath !== path) {
        await deleteThumbnail(oldPath);
      }

      console.log("[uploadManualThumb] ✅ sucesso");
      setWorkerState((s) => ({ ...s, uploadThumb: "done" }));
      setWorkerMsg(null);
      setSuccessMsg("Thumb enviada ✓");
      setTimeout(() => setSuccessMsg(null), 3000);
      router.refresh();
    } catch (err) {
      console.error("[uploadManualThumb] ❌ falha:", err);
      setWorkerState((s) => ({ ...s, uploadThumb: "error" }));
      setWorkerMsg(null);
      // Mensagem persistente em errorMsg (fica até próximo save/dismiss)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setErrorMsg(`Upload da thumb falhou: ${msg}`);
    }
  }

  // ────────────────────────────────────────────────────────
  // save (fields + pages)

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loaded) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const validPages = pageRows
        .filter((p) => /^https?:\/\//i.test(p.url.trim()))
        .map((p, idx) => ({
          url: p.url.trim(),
          title: p.title.trim() || null,
          visible: p.visible,
          display_order: idx,
        }));
      const res = await fetch(`/api/admin/offers/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          niche,
          language,
          structure,
          traffic_source: trafficSource,
          status,
          ad_count: Number(adCount) || 0,
          flags: flagsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          pages: validPages,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setSuccessMsg("Alterações salvas");
      setTimeout(() => setSuccessMsg(null), 2500);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // delete

  async function handleDelete() {
    if (!loaded) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/offers/${params.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "success",
        title: "Oferta deletada",
        description: `"${loaded.offer.title}" foi removida junto com todos os dados relacionados.`,
      });
      router.push("/admin/offers");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro ao deletar";
      setErrorMsg(msg);
      toast({
        kind: "error",
        title: "Não consegui deletar",
        description: msg,
      });
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  // ────────────────────────────────────────────────────────
  // render

  if (loadErr) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-[720px] mx-auto">
        <div className="glass rounded-[var(--r-lg)] p-8 text-center">
          <AlertTriangle size={28} className="text-[var(--error)] mx-auto mb-3" />
          <div className="text-[16px] font-medium mb-1">{loadErr}</div>
          <Link
            href="/admin/offers"
            className="text-[13px] text-text-2 hover:text-text underline"
          >
            Voltar pras ofertas
          </Link>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return <SkeletonEditForm />;
  }

  const o = loaded.offer;
  const thumbPublicUrl =
    o.vsl_thumbnail_path &&
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbs/${o.vsl_thumbnail_path}`;

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 max-w-[960px] mx-auto">
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar pras ofertas
      </Link>

      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Admin · Editar oferta
          </div>
          <h1 className="display text-[30px] font-semibold tracking-[-0.035em] leading-tight">
            {o.title}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-text-3">
            <span className="mono">/app/{o.slug}</span>
            <Link
              href={`/app/${o.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-text-2 hover:text-text underline"
            >
              <ExternalLink size={11} />
              ver público
            </Link>
          </div>
        </div>

        {/* Ações do header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={refreshing}
            onClick={async () => {
              if (refreshing) return;
              setRefreshing(true);
              setWorkerMsg("Enfileirando refresh prioritário...");
              try {
                const res = await fetch(
                  `/api/admin/offers/${o.id}/refresh`,
                  { method: "POST" }
                );
                const data = await res.json();
                if (!res.ok) {
                  setWorkerMsg(`❌ ${data.error ?? "falhou"}`);
                  setRefreshing(false);
                  return;
                }
                setWorkerMsg(`⟳ Atualizando ${o.title}... (priority=100)`);
                // Poll job status
                const jobId = data.job_id;
                const start = Date.now();
                while (Date.now() - start < 120_000) {
                  await new Promise((r) => setTimeout(r, 2500));
                  const s = await fetch(`/api/admin/jobs/${jobId}`);
                  if (!s.ok) continue;
                  const j = await s.json();
                  if (j.status === "done") {
                    setWorkerMsg(
                      `✅ Refresh concluído. Recarregando dados...`
                    );
                    // Refresh a página pra pegar novo ad_count
                    router.refresh();
                    setTimeout(() => setWorkerMsg(null), 3000);
                    break;
                  }
                  if (j.status === "error") {
                    setWorkerMsg(`❌ Erro: ${j.error ?? "desconhecido"}`);
                    break;
                  }
                  if (j.status === "pending" && j.attempts > 0) {
                    setWorkerMsg(
                      `↻ Retry ${j.attempts}/3 agendado (backoff)...`
                    );
                  }
                }
              } catch (err) {
                setWorkerMsg(
                  `❌ ${err instanceof Error ? err.message : String(err)}`
                );
              } finally {
                setRefreshing(false);
              }
            }}
            className="
              inline-flex items-center gap-1.5 h-9 px-4 rounded-full
              glass-light text-[13px] font-medium text-text
              hover:bg-[var(--bg-glass-hover)] transition-colors
              disabled:opacity-60 disabled:cursor-not-allowed
            "
            title="Força refresh_ad_count + compute_scale_score com priority alta"
          >
            {refreshing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={1.8} />
            )}
            {refreshing ? "Atualizando..." : "Atualizar agora"}
          </button>
        </div>
      </header>

      {/* AI-assisted authoring — sugestões aguardando revisão */}
      <AiDraftBanner offer={o} />

      {/* Worker feedback bar */}
      {workerMsg && (
        <div
          className="rounded-[var(--r-md)] px-4 py-2.5 text-[12px] font-medium flex items-center gap-2"
          style={{
            background: "rgba(99,102,241,0.12)",
            color: "#8B5CF6",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
        >
          <Zap size={12} strokeWidth={2.2} />
          {workerMsg}
        </div>
      )}

      {/* Feedback bar */}
      {(successMsg || errorMsg) && (
        <div
          className={`rounded-[var(--r-md)] px-4 py-3 text-[13px] font-medium flex items-center gap-2 ${
            successMsg
              ? "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)] border border-[var(--success)]/30"
              : "bg-[color-mix(in_srgb,var(--error)_12%,transparent)] text-[var(--error)] border border-[var(--error)]/30"
          }`}
        >
          {successMsg ? <Check size={14} /> : <AlertTriangle size={14} />}
          {successMsg ?? errorMsg}
        </div>
      )}

      {/* VSL management section */}
      <section className="glass rounded-[var(--r-lg)] p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
              VSL
            </div>
            <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
              {o.vsl_storage_path ? "Vídeo atual" : "Sem vídeo uploaded"}
            </h2>
          </div>
          {o.vsl_storage_path && (
            <div className="text-right text-[12px] text-text-3">
              <div className="mono">
                {o.vsl_duration_seconds
                  ? formatDuration(o.vsl_duration_seconds)
                  : "—"}
              </div>
              <div className="mono">
                {o.vsl_size_bytes
                  ? `${(o.vsl_size_bytes / 1024 / 1024).toFixed(1)}MB`
                  : ""}
              </div>
              {o.vsl_uploaded_at && (
                <div className="mono text-[10px] mt-0.5">
                  subido em {new Date(o.vsl_uploaded_at).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          {/* Current VSL preview */}
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-2">
              Preview atual
            </label>
            {vslUrl ? (
              <video
                src={vslUrl}
                poster={thumbPublicUrl ?? undefined}
                controls
                preload="metadata"
                playsInline
                className="w-full aspect-[16/10] rounded-[var(--r-md)] bg-black border border-[var(--border-hairline)]"
              />
            ) : o.vsl_storage_path ? (
              <div className="w-full aspect-[16/10] rounded-[var(--r-md)] bg-[var(--bg-elevated)] grid place-items-center text-[12px] text-text-3">
                Carregando preview…
              </div>
            ) : (
              <div className="w-full aspect-[16/10] rounded-[var(--r-md)] bg-[var(--bg-elevated)] grid place-items-center text-[12px] text-text-3">
                Nenhum vídeo ainda
              </div>
            )}
          </div>

          {/* Replace VSL */}
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-2">
              {o.vsl_storage_path ? "Substituir vídeo" : "Adicionar vídeo"}
            </label>

            {!replaceFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || replacingVsl}
                className="
                  w-full flex items-center justify-center gap-2 px-5 py-5
                  border-2 border-dashed border-[var(--border-default)] rounded-[var(--r-md)]
                  text-[13px] text-text-2 hover:text-text hover:border-[var(--border-strong)]
                  hover:bg-[var(--bg-glass)]
                  transition-[background,color,border-color] duration-200
                  disabled:opacity-50
                "
              >
                <Upload size={16} strokeWidth={1.5} />
                Selecionar mp4
              </button>
            ) : (
              <div className="glass-light rounded-[var(--r-md)] p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--bg-elevated)] grid place-items-center shrink-0">
                  <Film size={15} strokeWidth={1.5} className="text-text-2" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{replaceFile.name}</div>
                  <div className="text-[10px] text-text-3 mono mt-0.5">
                    {(replaceFile.size / 1024 / 1024).toFixed(1)}MB
                    {replaceDuration && ` · ${formatDuration(replaceDuration)}`}
                    {replacingVsl && replacePct > 0 && ` · ${replacePct}%`}
                  </div>
                  {replacingVsl && replacePct > 0 && (
                    <div className="mt-1 h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-200"
                        style={{ width: `${replacePct}%` }}
                      />
                    </div>
                  )}
                </div>
                {!replacingVsl && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceFile(null);
                      setReplaceDuration(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="p-1.5 text-text-3 hover:text-text"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={handleReplaceFile}
            />

            {replaceFile && !replacingVsl && (
              <button
                type="button"
                onClick={executeReplaceVsl}
                className="
                  mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                  bg-[var(--accent)] text-black font-medium text-[12px]
                  hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
                "
              >
                <RefreshCw size={13} strokeWidth={2} />
                Substituir agora
              </button>
            )}

            {o.vsl_storage_path && (
              <p className="text-[10px] text-text-3 mt-3 leading-relaxed">
                ⚠ Substituir sobrescreve o arquivo atual. Usuários que estão
                assistindo podem ter playback interrompido por alguns segundos.
              </p>
            )}
          </div>
        </div>

        {/* Worker actions row */}
        <div className="mt-5 pt-4 border-t border-[var(--border-hairline)] flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-text-3 uppercase tracking-[0.14em] font-semibold mr-1">
            Workers:
          </span>

          {/* Extract VSL from first landing */}
          <ExtractVslButton
            firstLanding={pageRows.find((p) => p.url && !p.url.includes("facebook.com"))?.url ?? null}
            running={workerState.extractVsl === "running"}
            onExtract={runExtractVsl}
          />

          {/* Gerar thumb do VSL */}
          {o.vsl_storage_path && (
            <button
              type="button"
              onClick={() => runGenThumb("vsl")}
              disabled={workerState.genThumb === "running"}
              className="
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                border border-[var(--border-default)] text-[11px] font-medium
                text-text-2 hover:text-text hover:bg-[var(--bg-glass)]
                transition-colors disabled:opacity-50
              "
            >
              {workerState.genThumb === "running" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ImageIcon size={11} strokeWidth={1.8} />
              )}
              Gerar thumb do VSL
            </button>
          )}

          {/* Upload thumb manual */}
          <label className="
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
            border border-[var(--border-default)] text-[11px] font-medium
            text-text-2 hover:text-text hover:bg-[var(--bg-glass)]
            transition-colors cursor-pointer
          ">
            {workerState.uploadThumb === "running" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Upload size={11} strokeWidth={1.8} />
            )}
            Enviar thumb manual
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadManualThumb(f);
              }}
            />
          </label>
        </div>
      </section>

      {/* Form: metadata + URLs */}
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-5">
          <div>
            <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
              Metadata
            </div>
            <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
              Informações da oferta
            </h2>
          </div>

          <div>
            <label className={labelStyle} htmlFor="title">
              Título
            </label>
            <input
              id="title"
              className={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div>
            <label className={labelStyle} htmlFor="slug">
              Slug
            </label>
            <input
              id="slug"
              className={`${inputStyle} mono`}
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              required
              disabled={saving}
            />
            <p className="text-[11px] text-text-3 mt-1.5">
              URL pública: <span className="mono">/app/{slug || "..."}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>Nicho</label>
              <select
                className={inputStyle}
                value={niche}
                onChange={(e) => setNiche(e.target.value as Niche)}
                disabled={saving}
              >
                {Object.entries(NICHE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Estrutura</label>
              <select
                className={inputStyle}
                value={structure}
                onChange={(e) => setStructure(e.target.value as OfferStructure)}
                disabled={saving}
              >
                {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Idioma</label>
              <select
                className={inputStyle}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                disabled={saving}
              >
                {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.flag} {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Tráfego</label>
              <select
                className={inputStyle}
                value={trafficSource}
                onChange={(e) => setTrafficSource(e.target.value as TrafficSource)}
                disabled={saving}
              >
                {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                      checked={status === k}
                      onChange={() =>
                        setStatus(k as "active" | "paused" | "draft")
                      }
                      className="sr-only peer"
                      disabled={saving}
                    />
                    <span className="w-3 h-3 rounded-full border border-[var(--border-strong)] peer-checked:bg-[var(--accent)] peer-checked:border-[var(--accent)] transition-colors" />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelStyle} htmlFor="ad_count">
                Anúncios ativos (ad_count)
              </label>
              <input
                id="ad_count"
                type="number"
                className={`${inputStyle} mono`}
                value={adCount}
                onChange={(e) => setAdCount(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <label className={labelStyle} htmlFor="flags">
              Flags (separadas por vírgula)
            </label>
            <input
              id="flags"
              className={inputStyle}
              value={flagsText}
              onChange={(e) => setFlagsText(e.target.value)}
              placeholder="escalando, novo, hot"
              disabled={saving}
            />
          </div>
        </section>

        {/* Worker Enrichment */}
        <section
          className="rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-4 border"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 100%)",
            borderColor: "rgba(99,102,241,0.3)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-0.5 flex items-center gap-1.5" style={{ color: "#8B5CF6" }}>
                <Zap size={11} strokeWidth={2.2} />
                Worker de enriquecimento
              </div>
              <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
                Importar da Ad Library ou landing
              </h2>
              <p className="text-[12px] text-text-2 mt-1 leading-relaxed max-w-[520px]">
                Cola uma URL (FB Ad Library page, FB page, ou landing) e clica
                "Enriquecer". O worker tira screenshot, extrai ad_count (se
                Ad Library) e baixa até 5 criativos automaticamente.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
              />
              <input
                type="url"
                value={enrichUrl}
                onChange={(e) => setEnrichUrl(e.target.value)}
                disabled={enriching}
                placeholder="https://facebook.com/ads/library/?view_all_page_id=..."
                className="
                  w-full pl-9 pr-4 py-2.5 rounded-[var(--r-md)]
                  bg-black/40 border border-[var(--border-default)]
                  text-[13px] text-text placeholder:text-text-3
                  transition-[border-color,background] duration-200
                  focus:outline-none focus:border-[#8B5CF6]
                  focus:bg-black/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]
                  disabled:opacity-60
                "
              />
            </div>
            <button
              type="button"
              onClick={runEnrichment}
              disabled={enriching || !enrichUrl.trim()}
              className="
                shrink-0 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full
                text-white font-medium text-[13px]
                transition-[transform,opacity] duration-200 ease-[var(--ease-spring)]
                hover:scale-[1.02]
                active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
              "
              style={{
                background:
                  "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
              }}
            >
              {enriching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} strokeWidth={2} />
              )}
              {enriching ? "Processando..." : "Enriquecer"}
            </button>
          </div>

          {enriching && (
            <div className="text-[12px] text-text-2 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Chromium rodando (30-60s)... tirando screenshot, procurando
              criativos...
            </div>
          )}

          {enrichResult && (
            <div
              className={`rounded-[var(--r-md)] px-4 py-3 text-[12px] flex items-start gap-2 ${
                enrichResult.ok
                  ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border border-[var(--success)]/30"
                  : "bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--error)] border border-[var(--error)]/30"
              }`}
            >
              {enrichResult.ok ? (
                <Check size={14} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                {enrichResult.ok ? (
                  <>
                    <div className="font-medium">
                      Enriquecido com sucesso ({enrichResult.pageType})
                    </div>
                    <div className="text-[11px] mt-1 text-text-2">
                      {enrichResult.creativesCreated! > 0
                        ? `${enrichResult.creativesCreated} criativo${enrichResult.creativesCreated === 1 ? "" : "s"}`
                        : "sem criativos"}
                      {enrichResult.landingPagesCreated! > 0 &&
                        ` · ${enrichResult.landingPagesCreated} landing${enrichResult.landingPagesCreated === 1 ? "" : "s"}`}
                      {enrichResult.checkoutPagesCreated! > 0 &&
                        ` · ${enrichResult.checkoutPagesCreated} checkout${enrichResult.checkoutPagesCreated === 1 ? "" : "s"}`}
                      {enrichResult.adCount != null &&
                        ` · ad_count = ${enrichResult.adCount}`}
                    </div>
                    {enrichResult.debug && (
                      <details className="mt-2 text-[10px] text-text-3 mono">
                        <summary className="cursor-pointer select-none hover:text-text-2">
                          debug (clica pra ver)
                        </summary>
                        <div className="mt-1 pl-2 border-l border-[var(--border-hairline)]">
                          candidates: {enrichResult.debug.mediaFound}
                          {" · "}graphql: {enrichResult.debug.graphqlHits}
                          {" · "}DOM vids: {enrichResult.debug.domVideosFound}
                          {" · "}DOM imgs: {enrichResult.debug.domImagesFound}
                          {" · "}net mp4s: {enrichResult.debug.interceptedMp4s}
                          {" · "}net imgs: {enrichResult.debug.interceptedImages}
                          {enrichResult.debug.landingUrlsFound != null &&
                            ` · landing URLs: ${enrichResult.debug.landingUrlsFound}`}
                        </div>
                      </details>
                    )}
                  </>
                ) : (
                  <>
                    <div className="font-medium">Falha ao enriquecer</div>
                    <div className="text-[11px] mt-1">{enrichResult.error}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Ad Library Monitor Card — o worker refresh este card diariamente */}
        <AdLibraryMonitorCard
          offerId={o.id}
          offerSlug={o.slug}
          adCount={o.ad_count ?? null}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lastRefreshedAt={(o as any).last_refreshed_at ?? null}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          refreshIntervalHours={(o as any).refresh_interval_hours ?? 24}
        />

        {/* Pages Management */}
        <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
                Páginas vinculadas
              </div>
              <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
                Ad Library, FB page, landing
              </h2>
              <p className="text-[12px] text-text-3 mt-1">
                Admin controla visibilidade e ordem. Worker da Fase B vai
                preencher screenshot + extrair criativos quando disponível.
              </p>
            </div>
            <button
              type="button"
              onClick={addPageRow}
              disabled={saving}
              className="
                shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-full
                border border-[var(--border-default)] text-[12px] font-medium
                text-text-2 hover:text-text hover:border-[var(--border-strong)]
                hover:bg-[var(--bg-glass)]
                transition-colors
              "
            >
              <Plus size={12} strokeWidth={2} />
              Adicionar página
            </button>
          </div>

          {pageRows.length === 0 ? (
            <div className="text-[13px] text-text-3 py-2 border-t border-[var(--border-hairline)] pt-4">
              Nenhuma página ainda. Clica em "Adicionar página" pra vincular URL.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pageRows.map((p, i) => {
                const hasShot = !!p.screenshot_url;
                const isShootingThis = workerState.screenshotPageId === p.id;
                return (
                  <div
                    key={i}
                    className={`
                      p-3 rounded-[var(--r-md)] border flex gap-3
                      ${p.visible
                        ? "bg-black/20 border-[var(--border-hairline)]"
                        : "bg-black/10 border-[var(--border-hairline)]/50 opacity-60"}
                    `}
                  >
                    {/* Preview thumbnail */}
                    <div className="shrink-0 w-[120px] md:w-[140px] aspect-[16/10] rounded-[var(--r-sm)] overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-hairline)] relative">
                      {isShootingThis ? (
                        <div className="absolute inset-0 grid place-items-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <Loader2 size={16} className="animate-spin" style={{ color: "#8B5CF6" }} />
                            <span className="text-[9px] text-text-3 uppercase tracking-wider">
                              Capturando...
                            </span>
                          </div>
                        </div>
                      ) : hasShot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.screenshot_url ?? ""}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <div className="flex flex-col items-center gap-1.5 text-text-4">
                            <ImageIcon size={18} strokeWidth={1.5} />
                            <span className="text-[9px] uppercase tracking-wider">
                              Sem preview
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Form fields */}
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      {/* Row 1: URL + actions */}
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => movePage(i, -1)}
                            disabled={saving || i === 0}
                            className="text-text-3 hover:text-text disabled:opacity-20"
                            aria-label="Mover pra cima"
                          >
                            <ArrowUp size={11} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePage(i, 1)}
                            disabled={saving || i === pageRows.length - 1}
                            className="text-text-3 hover:text-text disabled:opacity-20"
                            aria-label="Mover pra baixo"
                          >
                            <ArrowDown size={11} strokeWidth={2} />
                          </button>
                        </div>
                        <LinkIcon size={12} className="text-text-3 shrink-0" />
                        <input
                          className={`${inputStyle} flex-1 !py-2 !text-[12px]`}
                          value={p.url}
                          onChange={(e) => updatePageAt(i, { url: e.target.value })}
                          placeholder="https://..."
                          disabled={saving}
                        />
                        {p.id && (
                          <button
                            type="button"
                            onClick={() => runScreenshotPage(p.id!)}
                            disabled={saving || isShootingThis}
                            className="
                              shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full
                              border border-[#8B5CF6]/40 text-[10px] font-medium
                              hover:bg-[rgba(139,92,246,0.1)] transition-colors
                              disabled:opacity-50
                            "
                            style={{ color: "#A78BFA" }}
                            title={hasShot ? "Atualizar screenshot" : "Gerar screenshot via worker"}
                          >
                            {isShootingThis ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <ImageIcon size={10} strokeWidth={2} />
                            )}
                            {hasShot ? "Atualizar" : "Gerar print"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updatePageAt(i, { visible: !p.visible })}
                          disabled={saving}
                          className={`shrink-0 p-1.5 transition-colors ${
                            p.visible ? "text-text-2 hover:text-text" : "text-text-4 hover:text-text-2"
                          }`}
                          aria-label={p.visible ? "Ocultar" : "Mostrar"}
                          title={p.visible ? "Ocultar publicamente" : "Mostrar publicamente"}
                        >
                          {p.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => removePageAt(i)}
                          disabled={saving}
                          className="shrink-0 p-1.5 text-text-3 hover:text-[var(--error)] transition-colors"
                          aria-label="Remover"
                        >
                          <X size={13} />
                        </button>
                      </div>

                      {/* Row 2: title input */}
                      <input
                        className={`${inputStyle} !py-2 !text-[12px]`}
                        value={p.title}
                        onChange={(e) => updatePageAt(i, { title: e.target.value })}
                        placeholder="Título (opcional)"
                        disabled={saving}
                      />

                      {/* Row 3: fetched_at + open link */}
                      <div className="flex items-center justify-between gap-2 text-[10px] text-text-3">
                        <span>
                          {p.fetched_at
                            ? `Capturada em ${new Date(p.fetched_at).toLocaleDateString("pt-BR")} ${new Date(p.fetched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                            : !p.id
                              ? "Nova URL — clica em 'Gerar print' após salvar"
                              : "Ainda sem screenshot"}
                        </span>
                        {p.url && /^https?:\/\//i.test(p.url) && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-text-3 hover:text-text transition-colors"
                          >
                            <ExternalLink size={10} />
                            abrir
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Criativos Management */}
        <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
                Criativos
              </div>
              <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
                {creatives.length === 0
                  ? "Nenhum criativo ainda"
                  : `${creatives.length} ${creatives.length === 1 ? "criativo" : "criativos"}`}
              </h2>
              <p className="text-[12px] text-text-3 mt-1">
                Upload manual ou preenchido pelo worker. Admin controla
                visibilidade e ordem do que o usuário vê.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreativeModalOpen(true)}
              disabled={saving}
              className="
                shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full
                bg-[var(--accent)] text-black font-medium text-[12px]
                hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
              "
            >
              <Plus size={12} strokeWidth={2.2} />
              Adicionar criativo
            </button>
          </div>

          {creatives.length === 0 ? (
            <div className="text-[13px] text-text-3 py-2 border-t border-[var(--border-hairline)] pt-4">
              Sem criativos nessa oferta. Clica em "Adicionar criativo" pra subir
              video ou imagem.
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[...creatives]
                .sort((a, b) => a.display_order - b.display_order)
                .map((c, idx, arr) => (
                  <CreativeCardAdmin
                    key={c.id}
                    creative={c}
                    onToggleVisible={() => toggleCreativeVisible(c)}
                    onRemove={() => removeCreative(c)}
                    onMoveUp={idx === 0 ? undefined : () => moveCreative(c, -1)}
                    onMoveDown={
                      idx === arr.length - 1 ? undefined : () => moveCreative(c, 1)
                    }
                    onUseAsThumb={
                      c.kind === "video" ? () => runGenThumb("creative", c.id) : undefined
                    }
                  />
                ))}
            </div>
          )}
        </section>

        {creativeModalOpen && loaded && (
          <AddCreativeModal
            offerId={params.id as string}
            offerSlug={loaded.offer.slug}
            onClose={() => setCreativeModalOpen(false)}
            onCreated={handleCreativeCreated}
          />
        )}

        {/* Transcrição */}
        <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
                Transcrição
              </div>
              <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
                {transcriptDraft
                  ? `${transcriptDraft.length} chars`
                  : "Sem transcrição"}
              </h2>
              <p className="text-[12px] text-text-3 mt-1">
                Edita manualmente ou re-transcreve via Whisper a partir da VSL
                atual (30-90s).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runTranscribe}
                disabled={!o.vsl_storage_path || workerState.transcribe === "running"}
                className="
                  inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full
                  text-[12px] font-medium text-white
                  transition-[transform,opacity] duration-200 ease-[var(--ease-spring)]
                  hover:scale-[1.02]
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                "
                style={{
                  background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                }}
                title={!o.vsl_storage_path ? "Precisa ter VSL uploaded" : "Re-transcrever via Whisper"}
              >
                {workerState.transcribe === "running" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Sparkles size={11} strokeWidth={2} />
                )}
                Re-transcrever
              </button>
            </div>
          </div>

          <div className="relative">
            <textarea
              value={transcriptDraft}
              onChange={(e) => setTranscriptDraft(e.target.value)}
              rows={8}
              disabled={workerState.transcribe === "running"}
              placeholder="Texto da transcrição… edita aqui e clica Salvar."
              className={`
                w-full px-3.5 py-3 rounded-[var(--r-md)]
                bg-black/30 border border-[var(--border-default)]
                text-[13px] text-text placeholder:text-text-3 leading-relaxed
                transition-[border-color,background] duration-200
                focus:outline-none focus:border-[var(--accent)]
                focus:bg-black/50
                resize-y min-h-[180px] font-[system-ui]
                ${workerState.transcribe === "running" ? "opacity-40 pointer-events-none" : ""}
              `}
            />

            {/* Overlay de status enquanto roda Whisper */}
            {workerState.transcribe === "running" && (
              <div
                className="
                  absolute inset-0 rounded-[var(--r-md)]
                  flex flex-col items-center justify-center gap-4
                  pointer-events-none
                "
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
                  border: "1px solid rgba(139,92,246,0.3)",
                }}
              >
                {/* Shimmer bars */}
                <div className="flex flex-col gap-2 w-[70%] max-w-[420px]">
                  {[100, 85, 92, 78, 88].map((w, i) => (
                    <div
                      key={i}
                      className="h-2.5 rounded-full overflow-hidden relative"
                      style={{ width: `${w}%`, background: "rgba(139,92,246,0.14)" }}
                    >
                      <div
                        className="absolute inset-0 shimmer-bar"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.55) 50%, transparent 100%)",
                          animationDelay: `${i * 0.15}s`,
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Stage + timer */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="inline-flex items-center gap-2 text-[12px] font-medium" style={{ color: "#A78BFA" }}>
                    <Loader2 size={13} className="animate-spin" />
                    <span
                      key={transcribeStage}
                      className="transcribe-stage-fade"
                    >
                      {TRANSCRIBE_STAGES[transcribeStage]}
                    </span>
                  </div>
                  <div className="mono text-[11px] text-text-3">
                    {transcribeElapsed}s decorridos
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={saveTranscriptDraft}
              disabled={
                transcriptDraft === (loaded?.offer.transcript_text ?? loaded?.offer.transcript_preview ?? "")
              }
              className="
                inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                border border-[var(--border-default)]
                text-[12px] font-medium text-text-2 hover:text-text
                hover:bg-[var(--bg-glass)] hover:border-[var(--border-strong)]
                transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <Check size={12} strokeWidth={2} />
              Salvar transcrição
            </button>
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-4">
          {/* Delete */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className="
                inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                text-[12px] font-medium text-[var(--error)]
                hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
                transition-colors disabled:opacity-50
              "
            >
              <Trash2 size={13} strokeWidth={1.8} />
              Deletar oferta
            </button>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <Link
              href="/admin/offers"
              className="
                px-4 py-2.5 rounded-full text-[13px] font-medium
                text-text-2 hover:text-text hover:bg-[var(--bg-glass)]
                transition-colors
              "
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="
                inline-flex items-center gap-2 px-5 py-2.5 rounded-full
                bg-[var(--accent)] text-black font-medium text-[13px]
                shadow-[0_4px_20px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.4)]
                hover:scale-[1.02] hover:-translate-y-[1px]
                active:scale-[0.97]
                transition-[transform,box-shadow,opacity] duration-200 ease-[var(--ease-spring)]
                disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
              "
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} strokeWidth={2} />
              )}
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </form>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={confirmDelete}
        title={`Deletar "${loaded.offer.title}"?`}
        description="Essa oferta sai do catálogo pra sempre, junto com todas as páginas, criativos e transcrições ligadas a ela."
        warning="Esta ação é IRREVERSÍVEL. Não dá pra desfazer depois."
        confirmLabel="Sim, deletar tudo"
        cancelLabel="Cancelar"
        tone="danger"
        loading={saving}
        onCancel={() => {
          if (!saving) setConfirmDelete(false);
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Extract VSL button (promps URL + transcribe checkbox)

function ExtractVslButton({
  firstLanding,
  running,
  onExtract,
}: {
  firstLanding: string | null;
  running: boolean;
  onExtract: (url: string, transcribe: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(firstLanding ?? "");
  const [transcribe, setTranscribe] = useState(true);

  useEffect(() => {
    if (firstLanding && !url) setUrl(firstLanding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstLanding]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={running}
        className="
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
          border border-[var(--border-default)] text-[11px] font-medium
          text-text-2 hover:text-text hover:bg-[var(--bg-glass)]
          transition-colors disabled:opacity-50
        "
      >
        {running ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} strokeWidth={2} />}
        Extrair VSL do landing
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
          onClick={(e) => e.target === e.currentTarget && !running && setOpen(false)}
        >
          <div className="glass-strong rounded-[var(--r-xl)] p-5 w-full max-w-[480px] flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="display text-[18px] font-semibold">Extrair VSL do landing</h3>
                <p className="text-[12px] text-text-3 mt-1">
                  Worker abre URL, detecta vídeo (mp4/HLS), baixa em qualidade
                  otimizada e atualiza a oferta.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={running} className="p-1.5 text-text-3 hover:text-text">
                <X size={14} />
              </button>
            </div>

            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={running}
              required
              placeholder="https://landing.com/..."
              className="
                w-full px-3 py-2.5 rounded-[var(--r-md)]
                bg-black/40 border border-[var(--border-default)]
                text-[13px] text-text
                focus:outline-none focus:border-[#8B5CF6]
              "
            />

            <label className="inline-flex items-center gap-2 text-[12px] text-text-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={transcribe}
                onChange={(e) => setTranscribe(e.target.checked)}
                disabled={running}
                className="w-3.5 h-3.5 accent-[#8B5CF6]"
              />
              Transcrever também via Whisper (+30-90s)
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={running} className="px-3 py-1.5 text-[12px] text-text-2 hover:text-text">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!url.trim()) return;
                  onExtract(url.trim(), transcribe);
                  setOpen(false);
                }}
                disabled={running || !url.trim()}
                className="
                  inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full
                  text-white text-[12px] font-medium
                  disabled:opacity-50
                "
                style={{
                  background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                }}
              >
                <Zap size={11} strokeWidth={2.2} />
                Extrair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Creative card (admin)
// ────────────────────────────────────────────────────────────

function CreativeCardAdmin({
  creative,
  onToggleVisible,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUseAsThumb,
}: {
  creative: CreativeRow;
  onToggleVisible: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onUseAsThumb?: () => void;
}) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const assetPublicUrl = creative.asset_url.startsWith("http")
    ? creative.asset_url
    : `${supaUrl}/storage/v1/object/public/creatives/${creative.asset_url}`;
  const thumbPublicUrl = creative.thumbnail_url
    ? creative.thumbnail_url.startsWith("http")
      ? creative.thumbnail_url
      : `${supaUrl}/storage/v1/object/public/creatives/${creative.thumbnail_url}`
    : null;

  return (
    <div
      className={`
        glass-light rounded-[var(--r-md)] p-3 flex flex-col gap-2
        ${creative.visible ? "" : "opacity-50"}
      `}
    >
      {/* Preview */}
      <div className="relative aspect-[9/16] rounded-[var(--r-sm)] overflow-hidden bg-black border border-[var(--border-hairline)]">
        {creative.kind === "video" ? (
          <video
            src={assetPublicUrl}
            poster={thumbPublicUrl ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="w-full h-full object-contain"
          />
        ) : thumbPublicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetPublicUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-text-3">
            {creative.kind === "image" ? <ImageIcon size={24} /> : <Video size={24} />}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[10px] text-text-3">
          {creative.kind === "video" ? (
            <Video size={10} strokeWidth={1.8} />
          ) : (
            <ImageIcon size={10} strokeWidth={1.8} />
          )}
          <span className="uppercase tracking-wide">{creative.kind}</span>
          {creative.duration_seconds && (
            <>
              <span className="text-text-4">·</span>
              <span className="mono">{formatDuration(creative.duration_seconds)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              className="p-1 text-text-3 hover:text-text"
              aria-label="Mover pra esquerda"
            >
              <ArrowUp size={11} className="-rotate-90" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              className="p-1 text-text-3 hover:text-text"
              aria-label="Mover pra direita"
            >
              <ArrowDown size={11} className="-rotate-90" />
            </button>
          )}
          {onUseAsThumb && (
            <button
              type="button"
              onClick={onUseAsThumb}
              className="p-1 text-text-3 hover:text-[#8B5CF6]"
              aria-label="Usar como thumb"
              title="Gerar thumb da oferta a partir desse criativo"
            >
              <ImageIcon size={12} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleVisible}
            className={
              creative.visible ? "p-1 text-text-2 hover:text-text" : "p-1 text-text-4 hover:text-text-2"
            }
            aria-label={creative.visible ? "Ocultar" : "Mostrar"}
            title={creative.visible ? "Ocultar publicamente" : "Mostrar publicamente"}
          >
            {creative.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-text-3 hover:text-[var(--error)]"
            aria-label="Remover"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {creative.caption && (
        <p className="text-[11px] text-text-2 line-clamp-2">{creative.caption}</p>
      )}
      {creative.published_at && (
        <div className="text-[10px] text-text-3 mono">
          {new Date(creative.published_at).toLocaleDateString("pt-BR")}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Add creative modal
// ────────────────────────────────────────────────────────────

function AddCreativeModal({
  offerId,
  offerSlug,
  onClose,
  onCreated,
}: {
  offerId: string;
  offerSlug: string;
  onClose: () => void;
  onCreated: (c: CreativeRow) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const kind: CreativeKind =
    file?.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file?.name ?? "")
      ? "video"
      : "image";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      // 1. Thumb (best-effort se video)
      let thumbPath: string | null = null;
      let durationSec: number | null = null;
      if (kind === "video") {
        try {
          durationSec = await getVideoDuration(file);
        } catch {
          durationSec = null;
        }
        try {
          const blob = await generateVideoThumbnail(file, 3);
          const uuid =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2, 14);
          thumbPath = await uploadCreativeThumb(offerSlug, uuid, blob);
        } catch {
          thumbPath = null;
        }
      }

      // 2. Asset upload com progress
      const { assetPath } = await uploadCreativeAsset(offerSlug, file, (p) =>
        setPct(p)
      );

      // 3. POST metadata
      const res = await fetch(`/api/admin/offers/${offerId}/creatives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          asset_url: assetPath,
          thumbnail_url: thumbPath,
          duration_seconds: durationSec,
          caption: caption.trim() || null,
          published_at: publishedAt || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { creative: CreativeRow };
      onCreated(data.creative);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload falhou");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="glass-strong rounded-[var(--r-xl)] p-6 w-full max-w-[480px] flex flex-col gap-5"
      >
        <div className="flex items-start justify-between">
          <h2 className="display text-[20px] font-semibold">Adicionar criativo</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="p-1.5 text-text-3 hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* File input */}
        {!file ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="
              w-full flex items-center justify-center gap-2 px-5 py-8
              border-2 border-dashed border-[var(--border-default)] rounded-[var(--r-md)]
              text-[13px] text-text-2 hover:text-text hover:border-[var(--border-strong)]
              hover:bg-[var(--bg-glass)]
              transition-[background,color,border-color] duration-200
            "
          >
            <Upload size={18} strokeWidth={1.5} />
            Selecionar vídeo ou imagem
          </button>
        ) : (
          <div className="glass-light rounded-[var(--r-md)] p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--bg-elevated)] grid place-items-center shrink-0">
              {kind === "video" ? (
                <Video size={14} strokeWidth={1.5} className="text-text-2" />
              ) : (
                <ImageIcon size={14} strokeWidth={1.5} className="text-text-2" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate">{file.name}</div>
              <div className="text-[10px] text-text-3 mono mt-0.5">
                {(file.size / 1024 / 1024).toFixed(1)}MB
                {uploading && pct > 0 && ` · ${pct}%`}
              </div>
              {uploading && pct > 0 && (
                <div className="mt-1 h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="p-1.5 text-text-3 hover:text-text"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />

        {/* Caption */}
        <div>
          <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1.5">
            Legenda (opcional)
          </label>
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={uploading}
            placeholder="Ex: Gancho da viúva — versão C"
            className="
              w-full px-3 py-2 rounded-[var(--r-md)]
              bg-black/30 border border-[var(--border-default)]
              text-[13px] text-text placeholder:text-text-3
              transition-[border-color,background] duration-200
              focus:outline-none focus:border-[var(--accent)]
              focus:bg-black/50
              resize-y
            "
          />
        </div>

        {/* Published at */}
        <div>
          <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1.5">
            Data de veiculação (opcional)
          </label>
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            disabled={uploading}
            className="
              w-full px-3 py-2 rounded-[var(--r-md)]
              bg-black/30 border border-[var(--border-default)]
              text-[13px] text-text
              focus:outline-none focus:border-[var(--accent)]
            "
          />
        </div>

        {err && (
          <div className="text-[12px] text-[var(--error)]">{err}</div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-full text-[13px] text-text-2 hover:text-text"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={uploading || !file}
            className="
              inline-flex items-center gap-2 px-5 py-2 rounded-full
              bg-[var(--accent)] text-black font-medium text-[13px]
              hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
              disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
            "
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} strokeWidth={2} />
            )}
            {uploading ? `Enviando ${pct}%` : "Salvar criativo"}
          </button>
        </div>
      </form>
    </div>
  );
}
