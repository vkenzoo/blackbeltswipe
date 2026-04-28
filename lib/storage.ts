"use client";

import { createClient } from "@/lib/supabase/client";
import { assertSafeSlug } from "@/lib/security";

// Allowlist de extensões por tipo de upload — previne .exe/.sh/.php subir com
// content-type spoofado no name (ex: "file.exe.mp4").
const ALLOWED_VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v"]);
const ALLOWED_IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function pickExt(filename: string, allowed: Set<string>, fallback: string): string {
  const raw = filename.split(".").pop()?.toLowerCase() ?? "";
  if (allowed.has(raw)) return raw;
  return fallback;
}

/**
 * Upload de VSL (mp4) client-side pro bucket `vsls/`.
 * RLS policy "vsls writable by admin" autoriza se user for admin.
 *
 * Retorna o storage path (sem bucket prefix) pra salvar em offers.vsl_storage_path.
 */
export async function uploadVsl(
  slug: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ path: string; sizeBytes: number }> {
  assertSafeSlug(slug);
  const supabase = createClient();
  const ext = pickExt(file.name, ALLOWED_VIDEO_EXT, "mp4");
  const path = `${slug}.${ext}`;

  // Supabase JS SDK atual não expõe progresso nativo — usamos XHR manual pra isso
  if (onProgress) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Não autenticado");

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/vsls/${path}`;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("cache-control", "3600");
      xhr.setRequestHeader(
        "content-type",
        file.type || "application/octet-stream"
      );

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.send(file);
    });

    return { path, sizeBytes: file.size };
  }

  // fallback sem progress: SDK direto
  const { error } = await supabase.storage
    .from("vsls")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;
  return { path, sizeBytes: file.size };
}

/**
 * Extrai duração em segundos de um arquivo de vídeo via HTMLVideoElement.
 * Não é 100% preciso mas serve pra popular UI.
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed_to_load_metadata"));
    };
  });
}

/**
 * Gera thumbnail JPEG de um arquivo de vídeo usando <video> + <canvas>.
 * Pula pra `atSeconds` (3s default), captura frame, serializa como JPEG.
 * Retorna o Blob — use com uploadThumbnail(slug, blob).
 */
export function generateVideoThumbnail(
  file: File,
  atSeconds = 3
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      // Clamp no min(atSeconds, duration - 0.1) pra não ir além do fim
      const target = Math.min(atSeconds, Math.max(0, video.duration - 0.1));
      video.currentTime = target;
    };

    video.onseeked = () => {
      try {
        // Cap 1280px de largura pra manter thumb leve (~80-200KB)
        const maxW = 1280;
        const scale = Math.min(1, maxW / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return reject(new Error("canvas_context_failed"));
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) return reject(new Error("toBlob_null"));
            resolve(blob);
          },
          "image/jpeg",
          0.85
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("video_load_failed"));
    };
  });
}

/**
 * Upload de thumbnail pro bucket público `thumbs/`.
 *
 * IMPORTANTE: usa path com timestamp (`${slug}-${ts}.jpg`) pra evitar cache
 * do browser e do CDN Supabase (cacheControl 1h) — se sobrescrevêssemos
 * `${slug}.jpg` direto, usuário via a thumb antiga por até 1h.
 *
 * Aceita JPEG, PNG e WebP — mime-type detectado da `blob.type`. Se o mime
 * for desconhecido, fallback pra `image/jpeg`. Extensão do arquivo segue
 * o mime, mas o path sempre usa `.jpg` visualmente (CDN respeita o
 * Content-Type armazenado).
 *
 * Retorna o path resultante (sem prefixo de bucket) pra caller gravar em
 * `offers.vsl_thumbnail_path`. Caller é responsável por deletar o path
 * anterior se quiser cleanup (ver uploadThumbnailReplacing).
 */
export async function uploadThumbnail(slug: string, blob: Blob): Promise<string> {
  assertSafeSlug(slug);
  const supabase = createClient();

  // Normaliza mime — aceita jpeg, png, webp, com fallback seguro.
  const inputMime = (blob as unknown as { type?: string }).type ?? "";
  const contentType = ["image/jpeg", "image/png", "image/webp"].includes(inputMime)
    ? inputMime
    : "image/jpeg";

  // Timestamp no filename força cache-bust automático — cada upload = URL nova.
  const ts = Date.now();
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${slug}-${ts}.${ext}`;

  const { error } = await supabase.storage
    .from("thumbs")
    .upload(path, blob, {
      cacheControl: "3600",
      upsert: false, // path único, nunca deve colidir
      contentType,
    });
  if (error) throw error;
  return path;
}

/**
 * Deleta thumb antiga depois que nova foi upada com sucesso. Idempotente
 * e silencioso — se falhar (sem permissão, path já removido), não lança.
 * Caller usa pra manter bucket limpo sem acumular lixo a cada re-upload.
 */
export async function deleteThumbnail(oldPath: string | null | undefined): Promise<void> {
  if (!oldPath) return;
  try {
    const supabase = createClient();
    await supabase.storage.from("thumbs").remove([oldPath]);
  } catch {
    /* silent */
  }
}

/**
 * Upload de um criativo (video ou imagem) pro bucket `creatives/`.
 * Path: `${offerSlug}/${uuid}.${ext}`
 *
 * Retorna `{ assetPath, sizeBytes }` — o path é relativo ao bucket.
 * Signed URL é gerada sob demanda quando o player toca.
 */
export async function uploadCreativeAsset(
  offerSlug: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ assetPath: string; sizeBytes: number }> {
  assertSafeSlug(offerSlug, "offerSlug");
  const supabase = createClient();
  const isVideo = file.type.startsWith("video/");
  const ext = pickExt(
    file.name,
    isVideo ? ALLOWED_VIDEO_EXT : ALLOWED_IMAGE_EXT,
    isVideo ? "mp4" : "jpg"
  );
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 14);
  const path = `${offerSlug}/${uuid}.${ext}`;

  if (onProgress) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Não autenticado");

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/creatives/${path}`;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("cache-control", "3600");
      xhr.setRequestHeader(
        "content-type",
        file.type || "application/octet-stream"
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.send(file);
    });

    return { assetPath: path, sizeBytes: file.size };
  }

  const { error } = await supabase.storage
    .from("creatives")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw error;
  return { assetPath: path, sizeBytes: file.size };
}

/**
 * Upload de thumbnail (JPEG) de criativo pro bucket `creatives/` (mesmo bucket).
 * Path: `${offerSlug}/${uuidOrStem}_thumb.jpg`
 */
export async function uploadCreativeThumb(
  offerSlug: string,
  stem: string,
  blob: Blob
): Promise<string> {
  assertSafeSlug(offerSlug, "offerSlug");
  // stem pode ser UUID vindo do sistema — valida que não tem / ou .. tbm
  if (!/^[a-zA-Z0-9_-]+$/.test(stem) || stem.length > 80) {
    throw new Error("invalid_stem");
  }
  const supabase = createClient();
  const path = `${offerSlug}/${stem}_thumb.jpg`;
  const { error } = await supabase.storage
    .from("creatives")
    .upload(path, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "image/jpeg",
    });
  if (error) throw error;
  return path;
}
