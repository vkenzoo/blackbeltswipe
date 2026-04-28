import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

/**
 * Next 16 renomeou `middleware` pra `proxy`.
 * Arquivo antigo `middleware.ts` virou `proxy.ts` + export `proxy` ao invés de `middleware`.
 * Funcionalidade idêntica.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match todas as paths exceto estáticos, imagens e API internas do Next
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
