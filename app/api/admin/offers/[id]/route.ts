import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") return { error: "forbidden", status: 403 as const };
  return { supabase, user };
}

function detectPageType(url: string, explicit?: string): string {
  if (explicit && ["ad_library", "fb_page", "main_site", "checkout"].includes(explicit)) {
    return explicit;
  }
  const lower = url.toLowerCase();
  if (lower.includes("facebook.com/ads/library") || lower.includes("/ads/library")) {
    return "ad_library";
  }
  if (lower.includes("facebook.com/") || lower.includes("fb.com/")) {
    return "fb_page";
  }
  return "main_site";
}

/**
 * GET /api/admin/offers/[id]
 * Retorna a oferta + pages vinculadas (pra edit page).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: offer, error } = await auth.supabase
    .from("offers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !offer) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: pages } = await auth.supabase
    .from("pages")
    .select("id, url, type, screenshot_url, fetched_at, title, visible, display_order")
    .eq("offer_id", id)
    .order("display_order")
    .order("type");

  const { data: creatives } = await auth.supabase
    .from("creatives")
    .select("id, kind, asset_url, thumbnail_url, duration_seconds, captured_at, caption, published_at, visible, display_order")
    .eq("offer_id", id)
    .order("display_order")
    .order("captured_at", { ascending: false });

  return NextResponse.json({
    offer,
    pages: pages ?? [],
    creatives: creatives ?? [],
  });
}

/**
 * PATCH /api/admin/offers/[id]
 * Atualiza campos de uma oferta existente.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // whitelist de campos editáveis
  const allowed = [
    "title",
    "slug",
    "niche",
    "language",
    "structure",
    "traffic_source",
    "status",
    "ad_count",
    "launched_at",
    "thumb_gradient",
    "flags",
    "transcript_preview",
    "transcript_text",
    "ai_summary",
    "vsl_storage_path",
    "vsl_thumbnail_path",
    "vsl_duration_seconds",
    "vsl_size_bytes",
    "vsl_uploaded_at",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  // permitir atualização "só pages" (patch vazio mas body.pages preenchido)
  const hasPagesUpdate = Array.isArray(body.pages);
  if (Object.keys(patch).length === 0 && !hasPagesUpdate) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  let data: { id: string; slug: string } | null = null;
  if (Object.keys(patch).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (auth.supabase.from("offers") as any)
      .update(patch)
      .eq("id", id)
      .select("id, slug")
      .single();
    if (res.error) {
      return NextResponse.json(
        { error: res.error.message, code: res.error.code },
        { status: 400 }
      );
    }
    data = res.data;
  } else {
    // só pages — pega id/slug atual pro response
    const res = await auth.supabase
      .from("offers")
      .select("id, slug")
      .eq("id", id)
      .single<{ id: string; slug: string }>();
    data = res.data;
  }

  // Se body.pages veio como array, faz REPLACE completo das pages da oferta.
  // Admin envia a lista final; API apaga o que tinha e re-insere.
  // Aceita por item: { url, type?, title?, visible?, display_order? }
  if (hasPagesUpdate) {
    // Smart sync: preserva rows que já existiam (mesma URL) com seu screenshot_url
    // e só deleta/insere o que mudou. Auto-enqueue screenshot_page jobs pras URLs
    // novas ou sem screenshot ainda.
    type PageInput = {
      url?: string;
      type?: string;
      title?: string | null;
      visible?: boolean;
      display_order?: number;
    };
    const inputs = (body.pages as PageInput[])
      .filter((p) => typeof p.url === "string" && p.url.trim())
      .map((p, idx) => ({
        url: (p.url as string).trim(),
        type: detectPageType(p.url as string, p.type),
        title: p.title ?? null,
        visible: p.visible ?? true,
        display_order: p.display_order ?? idx,
      }));

    // Busca pages existentes pra comparar
    type ExistingPage = {
      id: string;
      url: string;
      screenshot_url: string | null;
      fetched_at: string | null;
    };
    const { data: existing } = await auth.supabase
      .from("pages")
      .select("id, url, screenshot_url, fetched_at")
      .eq("offer_id", id)
      .returns<ExistingPage[]>();
    const existingByUrl = new Map<string, ExistingPage>(
      (existing ?? []).map((e) => [e.url, e])
    );
    const newUrls = new Set(inputs.map((i) => i.url));

    // Delete rows cujas URLs não estão mais no input
    const toDelete = (existing ?? [])
      .filter((e) => !newUrls.has(e.url))
      .map((e) => e.id);
    if (toDelete.length > 0) {
      await auth.supabase.from("pages").delete().in("id", toDelete);
    }

    // Upsert: update se URL já existia (preserva screenshot_url), insert senão
    const newPageIdsNeedingScreenshot: string[] = [];
    for (const input of inputs) {
      const existing = existingByUrl.get(input.url);
      if (existing) {
        // UPDATE — preserva screenshot_url + fetched_at
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (auth.supabase.from("pages") as any)
          .update({
            type: input.type,
            title: input.title,
            visible: input.visible,
            display_order: input.display_order,
          })
          .eq("id", existing.id);
        // Se ainda não tem screenshot, enfileira job
        if (!existing.screenshot_url) {
          newPageIdsNeedingScreenshot.push(existing.id);
        }
      } else {
        // INSERT — página nova, enfileira screenshot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newRow } = await (auth.supabase.from("pages") as any)
          .insert({
            offer_id: id,
            url: input.url,
            type: input.type,
            title: input.title,
            visible: input.visible,
            display_order: input.display_order,
            fetched_at: null,
          })
          .select("id")
          .single();
        if (newRow?.id) newPageIdsNeedingScreenshot.push(newRow.id);
      }
    }

    // Auto-enqueue screenshot_page jobs pras páginas sem screenshot
    if (newPageIdsNeedingScreenshot.length > 0) {
      const jobRows = newPageIdsNeedingScreenshot.map((pageId) => ({
        kind: "screenshot_page",
        payload: { page_id: pageId },
        status: "pending",
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (auth.supabase.from("jobs") as any).insert(jobRows);
      console.log(
        `[offers PATCH] enqueued ${newPageIdsNeedingScreenshot.length} screenshot jobs`
      );
    }
  }

  return NextResponse.json({ ok: true, offer: data });
}

/**
 * DELETE /api/admin/offers/[id]
 * Remove uma oferta + VSL/thumb do Storage.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 1. Pega paths pra cleanup no storage antes de deletar o row
  const { data: offer } = await auth.supabase
    .from("offers")
    .select("vsl_storage_path, vsl_thumbnail_path")
    .eq("id", id)
    .maybeSingle<{ vsl_storage_path: string | null; vsl_thumbnail_path: string | null }>();

  // 2. Delete offer row (cascade deleta pages/creatives/metrics via FK)
  const { error } = await auth.supabase.from("offers").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  // 3. Best-effort: remove arquivos do Storage (não bloqueia se falhar)
  if (offer?.vsl_storage_path) {
    await auth.supabase.storage.from("vsls").remove([offer.vsl_storage_path]).catch(() => {});
  }
  if (offer?.vsl_thumbnail_path) {
    await auth.supabase.storage.from("thumbs").remove([offer.vsl_thumbnail_path]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
