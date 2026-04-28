import { redirect } from "next/navigation";

/**
 * Old path /admin/workers/guia agora vive em /admin/guias/workers
 * (parte da Central de Guias).
 */
export default function LegacyWorkersGuideRedirect() {
  redirect("/admin/guias/workers");
}
