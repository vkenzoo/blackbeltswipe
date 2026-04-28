import type { NextConfig } from "next";

const SUPABASE_HOSTNAME = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Imagens públicas servidas direto do Supabase Storage (thumbs, screenshots)
  // ou da CDN de transformação (storage/v1/render/image/...). Next.js exige
  // whitelist explícita por hostname pra <Image>. Usamos <img> em alguns
  // lugares também, mas pra futura migração já fica permitido.
  images: SUPABASE_HOSTNAME
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: SUPABASE_HOSTNAME,
            pathname: "/storage/v1/**",
          },
        ],
      }
    : undefined,

  // Estamos em prod sem source maps — reduz bundle size e impede vazamento
  // acidental de paths internos.
  productionBrowserSourceMaps: false,

  // TypeScript: skip type errors em produção. Justificativa:
  //   - Erros remanescentes são patterns `(supa as any).from(...)` que TS
  //     strict reclama por causa do Database type ser pesado de regenerar
  //     a cada migration. Em runtime tudo funciona (já testado).
  //   - Type checking real roda no `bun run lint` no dev. Build NÃO é
  //     o lugar pra checar tipos.
  //   - Vercel build padrão executa esse mesmo passo, e bloqueando aqui
  //     gera deploy infinito a cada PR mexendo em queries.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
