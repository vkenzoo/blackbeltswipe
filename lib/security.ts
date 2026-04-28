/**
 * Helpers de segurança usados em múltiplos pontos do sistema.
 *
 * - isSafeExternalUrl: previne SSRF (fetch de IPs internos / metadata endpoints)
 * - sanitizeLogMessage: remove tokens/keys antes de gravar em logs
 * - validateSlug: previne path traversal em uploads
 */

// ─────────────────────────────────────────────────────────────
// SSRF — validação de URL antes de fetch/Playwright
// ─────────────────────────────────────────────────────────────

/**
 * Hostnames bloqueados pra não vazarem metadata de infra / atacarem rede interna.
 */
const SSRF_BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "169.254.169.254", // AWS/GCP/Azure metadata
  "metadata.google.internal",
  "metadata",
  "fd00::", // IPv6 ULA prefix
];

/**
 * Prefixos de IP RFC1918 + link-local + loopback (IPv4) que não devem ser fetchados.
 */
const SSRF_BLOCKED_IPV4_PREFIXES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

export type SafeUrlResult =
  | { safe: true; url: URL }
  | { safe: false; reason: string };

/**
 * Valida se uma URL é segura pra fetch externo. Rejeita:
 *   - protocolo não-http(s)
 *   - IPs privados / loopback
 *   - hostnames de metadata cloud
 *   - porta não-standard se explicitamente internal
 */
export function isSafeExternalUrl(input: string): SafeUrlResult {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { safe: false, reason: "invalid_url_format" };
  }

  if (!["http:", "https:"].includes(u.protocol)) {
    return { safe: false, reason: `unsafe_protocol_${u.protocol}` };
  }

  const host = u.hostname.toLowerCase();

  if (SSRF_BLOCKED_HOSTS.includes(host)) {
    return { safe: false, reason: `blocked_host_${host}` };
  }

  // IPv4 direto
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    for (const prefix of SSRF_BLOCKED_IPV4_PREFIXES) {
      if (prefix.test(host)) {
        return { safe: false, reason: `blocked_ipv4_range_${host}` };
      }
    }
  }

  // IPv6 bracket notation [::1]
  if (host.startsWith("[")) {
    return { safe: false, reason: `blocked_ipv6_bracket` };
  }

  return { safe: true, url: u };
}

// ─────────────────────────────────────────────────────────────
// Log sanitization — remove tokens antes de gravar em DB/stdout
// ─────────────────────────────────────────────────────────────

/**
 * Substitui secrets conhecidos por [REDACTED] em strings que vão pra log.
 * Usa no error_message do meta_api_calls e outros logs que podem incluir
 * respostas da Meta (que as vezes vêm com tokens em clear).
 */
export function sanitizeLogMessage(msg: string | null | undefined): string {
  if (!msg) return "";
  return msg
    // OpenAI secret keys (sk-proj-... ou sk-...)
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-[REDACTED]")
    // Meta access tokens (começam com EAA e têm tamanho grande)
    .replace(/EAA[A-Za-z0-9]{50,}/g, "EAA[REDACTED]")
    // Genérico "access_token=<string>" query param
    .replace(/access_token=[A-Za-z0-9_.-]{20,}/gi, "access_token=[REDACTED]")
    // Authorization Bearer headers
    .replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gi, "Bearer [REDACTED]")
    // Supabase JWTs (service role)
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "eyJ[JWT_REDACTED]")
    .slice(0, 500); // limite de tamanho final
}

// ─────────────────────────────────────────────────────────────
// Path validation — previne traversal em slug-based file paths
// ─────────────────────────────────────────────────────────────

/**
 * Valida que slug é seguro pra usar como path no Storage.
 * Permite só [a-z0-9-], sem pontos, sem slashes.
 */
export function isSafeSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= 80 &&
    /^[a-z0-9-]+$/.test(slug)
  );
}

/**
 * Throws se slug inválido. Usado pra guard de upload functions.
 */
export function assertSafeSlug(slug: string, label: string = "slug"): void {
  if (!isSafeSlug(slug)) {
    throw new Error(
      `invalid_${label}: must match /^[a-z0-9-]+$/ (got "${slug.slice(0, 40)}")`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Checkout detection — NUNCA tentar baixar VSL de checkout
// ─────────────────────────────────────────────────────────────

/**
 * Domínios de processadores de checkout conhecidos. Nunca têm VSL embutida
 * (são páginas de finalização de compra). Se admin ou Meta API retornar
 * uma URL desses domínios como "landing", o sistema deve IGNORAR e não
 * tentar extrair VSL — já existe página `type='checkout'` pra esses casos.
 */
const CHECKOUT_HOSTS = [
  // Hotmart
  "pay.hotmart.com",
  "hotmart.com",
  "hotmart.host",
  "hotmart.art",
  // Kiwify
  "pay.kiwify.com.br",
  "pay.kiwify.com",
  "kiwify.com.br",
  "kiwify.com",
  "kiwify.app",
  // Eduzz
  "pay.eduzz.com",
  "eduzz.com",
  "sun.eduzz.com",
  // Perfect Pay, Braip, Kirvano, Monetizze, Ticto
  "perfectpay.com.br",
  "go.perfectpay.com.br",
  "checkout.perfectpay.com.br",
  "braip.com",
  "ev.braip.com",
  "kirvano.com",
  "pay.kirvano.com",
  "monetizze.com.br",
  "app.monetizze.com.br",
  "ticto.com.br",
  "pay.ticto.com.br",
  // Pagseguro, Mercado Pago, Stripe, PayPal
  "pagseguro.com.br",
  "pagseguro.uol.com.br",
  "mercadopago.com.br",
  "mercadopago.com",
  "checkout.stripe.com",
  "paypal.com",
  "www.paypal.com",
  // Sunize, Pepper, Yampi
  "sunize.com.br",
  "pepper.com.br",
  "yampi.com.br",
  "checkout.yampi.com.br",
];

/**
 * Tracking redirects / social platforms — também não devem ser enrichados
 * diretamente porque não representam a landing final do advertiser.
 *
 * Instagram/TikTok/etc: perfis, posts, reels e lives NÃO têm VSL extraível
 * (Meta protege o HLS por auth/DRM, reels não são VSL de venda, perfis são
 * listas de conteúdo). Bloqueamos proativamente pra evitar Playwright
 * queimando 30min timeout tentando achar mp4 que não existe.
 */
const REDIRECT_OR_SOCIAL_HOSTS = [
  // Facebook redirects + profile
  "l.facebook.com",
  "lm.facebook.com",
  "link.fb.me",
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  // Instagram
  "instagram.com",
  "www.instagram.com",
  "l.instagram.com",
  "instagr.am",
  // TikTok
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  // YouTube (não é landing, é plataforma — vídeos ≠ VSL estruturada)
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  // Twitter/X
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "t.co",
  // LinkedIn
  "linkedin.com",
  "www.linkedin.com",
  "lnkd.in",
  // URL shorteners
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
];

// Whitelist: URLs do Ad Library do Facebook SÃO permitidas (mesmo que o host
// seja facebook.com). O handler `bulk_ad_library_prep` processa essas URLs
// corretamente — não confundir com perfil/post de FB.
function isAdLibraryUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return /\/ads\/library/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Retorna true se hostname é checkout — nunca deve ser alvo de VSL extraction.
 */
export function isCheckoutUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return CHECKOUT_HOSTS.some(
      (h) => host === h || host.endsWith("." + h)
    );
  } catch {
    return false;
  }
}

/**
 * Retorna true se hostname é tracking / social redirect / plataforma social.
 * URLs desses hosts não devem ser alvo de VSL extraction: shorteners
 * precisam ser resolvidos antes; perfis/posts não têm VSL vendável.
 *
 * Exceção: URLs do Ad Library do Facebook (`/ads/library/...`) passam,
 * porque bulk_ad_library_prep sabe extrair landing real via Meta API.
 */
export function isRedirectOrSocialUrl(urlStr: string): boolean {
  // Ad Library é FB mas é caminho legítimo pro sistema
  if (isAdLibraryUrl(urlStr)) return false;
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return REDIRECT_OR_SOCIAL_HOSTS.some(
      (h) => host === h || host.endsWith("." + h)
    );
  } catch {
    return false;
  }
}

/**
 * True se URL é OK pra tentar extrair VSL.
 */
export function isLandingCandidateUrl(urlStr: string): boolean {
  if (isCheckoutUrl(urlStr)) return false;
  if (isRedirectOrSocialUrl(urlStr)) return false;
  return true;
}
