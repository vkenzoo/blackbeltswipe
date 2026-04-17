"use client";

import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
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
