/**
 * Helper pra construir URLs de imagens do Supabase Storage com transformação
 * (resize + WebP) via endpoint `/storage/v1/render/image`.
 *
 * Reduz payload em 5-10× vs servir a imagem original full-size.
 *
 * Fallback gracioso: se env var faltar, retorna null; se bucket não suportar
 * transform, retorna URL original pública.
 */

type ImageOpts = {
  /** Largura final em px (altura ajusta proporcional). Default 400. */
  width?: number;
  /** Qualidade WebP 20-100. Default 75. */
  quality?: number;
  /** Se true, usa render endpoint (transform). Se false, URL pública original. */
  transform?: boolean;
};

/**
 * Constrói URL de um path do Storage com opcional transformação.
 *
 * @param bucket  Nome do bucket (ex: "thumbs", "creative-thumbs")
 * @param path    Path do objeto no bucket
 * @param opts    Opções de resize/quality
 * @returns URL pronta pra usar em <img src> ou null se env var falta
 */
export function storageUrl(
  bucket: string,
  path: string | null | undefined,
  opts: ImageOpts = {}
): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    if (typeof window !== "undefined") {
      console.warn("[storageUrl] NEXT_PUBLIC_SUPABASE_URL ausente");
    }
    return null;
  }

  const { width = 400, quality = 75, transform = true } = opts;

  if (!transform) {
    return `${base}/storage/v1/object/public/${bucket}/${path}`;
  }

  // Endpoint de transformação — só funciona com buckets que permitam
  // (thumbs + creative-thumbs no nosso caso)
  const params = new URLSearchParams({
    width: String(width),
    quality: String(quality),
    resize: "cover",
  });
  return `${base}/storage/v1/render/image/public/${bucket}/${path}?${params.toString()}`;
}

/**
 * Conveniência pro bucket `thumbs` (VSL covers).
 * Width default de 400 é o suficiente pros cards do dashboard.
 * Pro hero da detail page passa width={800} explícito.
 */
export function thumbUrl(
  path: string | null | undefined,
  opts?: Omit<ImageOpts, "transform">
): string | null {
  return storageUrl("thumbs", path, opts);
}

/**
 * Srcset string pra retina/density-switching.
 * Ex: `thumbSrcSet("x/y.jpg", 400)` → "...w=400 1x, ...w=800 2x"
 */
export function thumbSrcSet(
  path: string | null | undefined,
  baseWidth: number = 400
): string | undefined {
  const a = thumbUrl(path, { width: baseWidth });
  const b = thumbUrl(path, { width: baseWidth * 2 });
  if (!a || !b) return undefined;
  return `${a} 1x, ${b} 2x`;
}
