import Link from "next/link";
import {
  Users,
  Shield,
  UserCheck,
  Star,
  Bell,
  FileText,
  Image as ImageIcon,
  Heart,
  Activity,
  AlertCircle,
  Clock,
  Mail,
  RefreshCw,
  TrendingUp,
  LogIn,
  LogOut,
  Download,
  Eye,
  History,
} from "lucide-react";
import {
  getAppStats,
  listMembers,
  getRecentActivity,
  type Member,
  type RecentActivity as ActivityRow,
} from "@/lib/queries/users";
import { requireAdmin } from "@/lib/auth/require-admin";

// ISR: revalida a cada 30s. Membros + atividade não precisam realtime estrito.
export const revalidate = 30;

const ACTIVITY_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "sign_in", label: "Logins" },
  { value: "sign_out", label: "Logouts" },
  { value: "signup", label: "Cadastros" },
  { value: "transcript_download", label: "Downloads" },
  { value: "favorite", label: "Favoritos" },
  { value: "alert", label: "Alerts" },
] as const;

export default async function MembrosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; user?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const kindFilter = params.kind ?? "all";
  const userFilter = params.user;

  const [stats, members, activity] = await Promise.all([
    getAppStats(),
    listMembers(),
    getRecentActivity({ kind: kindFilter, user_id: userFilter, limit: 100 }),
  ]);

  const focusedUser = userFilter ? members.find((m) => m.id === userFilter) : null;

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Membros & App
          </h1>
          <p className="text-[13px] text-text-2">
            Usuários cadastrados, logs de atividade e stats gerais do sistema
          </p>
        </div>
        <form action="/admin/membros">
          <button
            type="submit"
            className="
              inline-flex items-center gap-2 h-9 px-4 rounded-full
              glass-light text-[13px] font-medium text-text
              hover:bg-[var(--bg-glass-hover)] transition-colors
            "
          >
            <RefreshCw size={13} strokeWidth={1.8} />
            Atualizar
          </button>
        </form>
      </header>

      {/* ── App overview stats ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Users size={14} strokeWidth={1.8} />}
          label="Usuários"
          value={stats.users_total.toLocaleString("pt-BR")}
          hint={`${stats.users_by_role.admin} admin · ${stats.users_by_role.member} member · ${stats.users_by_role.affiliate} affiliate`}
        />
        <StatCard
          icon={<UserCheck size={14} strokeWidth={1.8} />}
          label="Ativos 7d"
          value={stats.users_signed_in_7d.toLocaleString("pt-BR")}
          hint={`${stats.users_total > 0 ? ((stats.users_signed_in_7d / stats.users_total) * 100).toFixed(0) : 0}% dos usuários`}
          tone="success"
        />
        <StatCard
          icon={<TrendingUp size={14} strokeWidth={1.8} />}
          label="Ofertas"
          value={stats.offers_total.toLocaleString("pt-BR")}
          hint={`${stats.offers_by_status.active} active · ${stats.offers_by_status.paused} paused · ${stats.offers_by_status.draft} draft`}
        />
        <StatCard
          icon={<Heart size={14} strokeWidth={1.8} />}
          label="Favoritos"
          value={stats.favorites_total.toLocaleString("pt-BR")}
          hint={
            stats.users_total > 0
              ? `~${(stats.favorites_total / stats.users_total).toFixed(1)} / usuário`
              : "—"
          }
        />

        <StatCard
          icon={<ImageIcon size={14} strokeWidth={1.8} />}
          label="Criativos"
          value={stats.creatives_total.toLocaleString("pt-BR")}
          hint={`${stats.creatives_with_transcript} com transcrição`}
        />
        <StatCard
          icon={<FileText size={14} strokeWidth={1.8} />}
          label="Páginas"
          value={stats.pages_total.toLocaleString("pt-BR")}
          hint={`${stats.pages_with_screenshot} com screenshot`}
        />
        <StatCard
          icon={<Bell size={14} strokeWidth={1.8} />}
          label="Alerts"
          value={stats.alerts_total.toLocaleString("pt-BR")}
          hint={`${stats.alerts_unseen} não vistos`}
        />
        <StatCard
          icon={<Activity size={14} strokeWidth={1.8} />}
          label="Jobs"
          value={`${stats.jobs_running}`}
          hint={`running · ${stats.jobs_pending} pending${stats.jobs_error_24h > 0 ? ` · ${stats.jobs_error_24h} err 24h` : ""}`}
          tone={stats.jobs_error_24h > 5 ? "error" : stats.jobs_running > 0 ? "warning" : "default"}
        />
      </section>

      {/* ── Members table ── */}
      <section className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
          <div>
            <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
              Membros
            </h2>
            <p className="text-[12px] text-text-3 mt-0.5">
              {members.length} usuários cadastrados
            </p>
          </div>
        </div>

        {members.length === 0 ? (
          <EmptyState>Nenhum usuário cadastrado ainda.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                  <th className="text-left px-5 py-2.5">Usuário</th>
                  <th className="text-left px-3 py-2.5 w-[110px]">Role</th>
                  <th className="text-right px-3 py-2.5 w-[100px]">Entrada</th>
                  <th className="text-right px-3 py-2.5 w-[120px]">Último login</th>
                  <th className="text-right px-3 py-2.5 w-[80px]">Favoritos</th>
                  <th className="text-right px-3 py-2.5 w-[90px]">Alerts</th>
                  <th className="text-right px-5 py-2.5 w-[90px]">Eventos</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <MemberRow key={m.id} m={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Event logs feed ── */}
      <section className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <History size={14} strokeWidth={1.8} className="text-text-3" />
            <div>
              <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
                Logs de eventos
                {focusedUser && (
                  <span className="text-[13px] font-normal text-text-3 ml-2">
                    · {focusedUser.name ?? focusedUser.email.split("@")[0]}
                  </span>
                )}
              </h2>
              <p className="text-[12px] text-text-3 mt-0.5">
                {focusedUser
                  ? `Atividade de ${focusedUser.email}`
                  : "Todos os eventos do sistema — logins, downloads, alerts e mais"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* User filter clear */}
            {focusedUser && (
              <Link
                href={`/admin/membros${kindFilter !== "all" ? `?kind=${kindFilter}` : ""}`}
                className="
                  inline-flex items-center gap-1 h-7 px-2.5 rounded-full
                  text-[11px] font-medium text-[var(--error)]
                  hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
                  transition-colors
                "
              >
                ✕ Limpar user
              </Link>
            )}

            {/* Kind filter pills */}
            <KindFilter active={kindFilter} userFilter={userFilter ?? null} />
          </div>
        </div>

        {activity.length === 0 ? (
          <EmptyState>
            {kindFilter !== "all" || focusedUser
              ? "Nenhum evento bate com os filtros atuais."
              : "Nenhuma atividade ainda. Assim que usuários logarem ou baixarem algo, aparece aqui."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--border-hairline)]">
            {activity.map((a) => (
              <ActivityItem key={a.id} a={a} />
            ))}
          </ul>
        )}

        {activity.length >= 100 && (
          <div className="px-5 py-3 text-[11px] text-text-3 border-t border-[var(--border-hairline)] text-center">
            Mostrando últimos 100 · aplique filtros pra refinar
          </div>
        )}
      </section>
    </div>
  );
}

function KindFilter({
  active,
  userFilter,
}: {
  active: string;
  userFilter: string | null;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-full glass-light border border-[var(--border-hairline)] flex-wrap"
      role="tablist"
    >
      {ACTIVITY_FILTERS.map((f) => {
        const isActive = f.value === active;
        const params = new URLSearchParams();
        if (f.value !== "all") params.set("kind", f.value);
        if (userFilter) params.set("user", userFilter);
        const href = params.toString()
          ? `/admin/membros?${params.toString()}`
          : "/admin/membros";
        return (
          <Link
            key={f.value}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`
              px-2.5 h-7 grid place-items-center rounded-full
              text-[11px] font-medium
              transition-colors duration-[var(--dur-2)] ease-[var(--ease-apple)]
              ${
                isActive
                  ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-text-3 hover:text-text-2"
              }
            `}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
      ? "#F59E0B"
      : tone === "error"
      ? "var(--error)"
      : "var(--text)";

  return (
    <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <span className="text-text-3">{icon}</span>
        {label}
      </div>
      <div
        className="display text-[22px] font-semibold tracking-[-0.02em] mt-0.5"
        style={{ color }}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-text-3">{hint}</div>}
    </div>
  );
}

function MemberRow({ m }: { m: Member }) {
  const displayName = m.name?.trim() || m.email.split("@")[0];
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <tr className="border-t border-[var(--border-hairline)] hover:bg-[var(--bg-glass)] transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover border border-[var(--border-hairline)]"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-semibold text-white border border-[var(--border-hairline)]"
              style={{
                background: `hsl(${hashHue(m.id)}deg 45% 40%)`,
              }}
              aria-hidden="true"
            >
              {initials || "?"}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium text-text truncate">
              {displayName}
            </span>
            <span className="text-[11px] text-text-3 truncate">{m.email}</span>
          </div>
          {!m.email_confirmed_at && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-[#F59E0B] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(245,158,11,0.12)" }}
              title="Email não confirmado"
            >
              <Mail size={9} strokeWidth={1.8} />
              pendente
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-3">
        <RoleBadge role={m.role} />
      </td>

      <td className="px-3 py-3 text-right mono tabular-nums text-[11px] text-text-2">
        {formatDateShort(m.created_at)}
      </td>

      <td className="px-3 py-3 text-right mono tabular-nums text-[11px]">
        {m.last_sign_in_at ? (
          <span className="text-text-2">{formatRelative(m.last_sign_in_at)}</span>
        ) : (
          <span className="text-text-3 italic">nunca</span>
        )}
      </td>

      <td className="px-3 py-3 text-right mono tabular-nums text-[12px] text-text-2">
        {m.favorites_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-text">
            <Heart size={10} strokeWidth={1.8} className="text-[var(--error)]" />
            {m.favorites_count}
          </span>
        ) : (
          <span className="text-text-3">—</span>
        )}
      </td>

      <td className="px-3 py-3 text-right mono tabular-nums text-[12px]">
        {m.alerts_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-text-2">
            <Bell size={10} strokeWidth={1.8} />
            {m.alerts_count}
            {m.alerts_unread > 0 && (
              <span className="text-[#F59E0B] font-semibold">
                ({m.alerts_unread})
              </span>
            )}
          </span>
        ) : (
          <span className="text-text-3">—</span>
        )}
      </td>

      <td className="px-5 py-3 text-right mono tabular-nums text-[12px]">
        {m.events_count > 0 ? (
          <Link
            href={`/admin/membros?user=${m.id}`}
            className="inline-flex items-center gap-1 text-text-2 hover:text-text transition-colors"
            title="Ver logs deste usuário"
          >
            <Activity size={10} strokeWidth={1.8} />
            {m.events_count}
          </Link>
        ) : (
          <span className="text-text-3">—</span>
        )}
      </td>
    </tr>
  );
}

function RoleBadge({ role }: { role: "admin" | "member" | "affiliate" }) {
  const cfg = {
    admin: { label: "Admin", color: "var(--error)", icon: <Shield size={10} /> },
    member: { label: "Member", color: "var(--text-2)", icon: <UserCheck size={10} /> },
    affiliate: {
      label: "Affiliate",
      color: "#8B5CF6",
      icon: <Star size={10} />,
    },
  }[role];

  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ActivityItem({ a }: { a: ActivityRow }) {
  const displayName = a.user_name?.trim() || a.user_email.split("@")[0];
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  const { icon, color } = kindIconColor(a.kind);
  const browser = a.user_agent ? parseBrowser(a.user_agent) : null;

  return (
    <li className="group/row px-5 py-3 flex items-center gap-3 hover:bg-[var(--bg-glass)] transition-colors">
      {a.user_avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.user_avatar}
          alt=""
          className="w-7 h-7 rounded-full object-cover border border-[var(--border-hairline)] shrink-0"
        />
      ) : (
        <div
          className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold text-white border border-[var(--border-hairline)] shrink-0"
          style={{
            background: `hsl(${hashHue(a.user_email)}deg 45% 40%)`,
          }}
          aria-hidden="true"
        >
          {initials || "?"}
        </div>
      )}

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span
          className="shrink-0 grid place-items-center w-5 h-5 rounded"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          {icon}
        </span>
        <span className="text-[12.5px] text-text truncate">
          <Link
            href={`/admin/membros?user=${a.user_id}`}
            className="font-medium hover:underline"
            title={`Filtrar eventos de ${a.user_email}`}
          >
            {displayName}
          </Link>{" "}
          <span className="text-text-2">{a.payload_summary}</span>
          {a.offer_slug && (
            <>
              {" "}
              <Link
                href={`/app/${a.offer_slug}`}
                className="mono text-[11px] text-text-3 hover:text-text transition-colors"
              >
                ({a.offer_slug})
              </Link>
            </>
          )}
        </span>
      </div>

      {browser && (
        <span
          className="hidden md:inline-flex mono text-[10px] text-text-3 px-1.5 py-0.5 rounded shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
          style={{ background: "var(--bg-elevated)" }}
          title={a.user_agent ?? ""}
        >
          {browser}
        </span>
      )}

      <span className="mono text-[10.5px] text-text-3 tabular-nums shrink-0">
        {formatRelative(a.created_at)}
      </span>
    </li>
  );
}

function kindIconColor(kind: ActivityRow["kind"]): {
  icon: React.ReactNode;
  color: string;
} {
  switch (kind) {
    case "sign_in":
      return {
        icon: <LogIn size={11} strokeWidth={2} />,
        color: "var(--success)",
      };
    case "sign_out":
      return {
        icon: <LogOut size={11} strokeWidth={2} />,
        color: "#71717A",
      };
    case "signup":
    case "sign_up":
      return {
        icon: <UserCheck size={11} strokeWidth={2} />,
        color: "#10B981",
      };
    case "favorite":
    case "favorite_add":
    case "favorite_remove":
      return {
        icon: <Heart size={11} strokeWidth={2} />,
        color: "var(--error)",
      };
    case "alert":
      return {
        icon: <Bell size={11} strokeWidth={2} />,
        color: "#F59E0B",
      };
    case "transcript_download":
      return {
        icon: <Download size={11} strokeWidth={2} />,
        color: "#EC4899",
      };
    case "offer_view":
      return {
        icon: <Eye size={11} strokeWidth={2} />,
        color: "#06B6D4",
      };
    case "profile_update":
    case "role_change":
    case "admin_action":
      return {
        icon: <Shield size={11} strokeWidth={2} />,
        color: "#8B5CF6",
      };
    default:
      return {
        icon: <Activity size={11} strokeWidth={2} />,
        color: "var(--text-3)",
      };
  }
}

/** Extrai nome do browser/OS simplificado do user_agent */
function parseBrowser(ua: string): string {
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/edg/i.test(ua)) return "Edge";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Browser";
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-10 flex flex-col items-center gap-2 text-[13px] text-text-3">
      <AlertCircle size={18} strokeWidth={1.5} className="opacity-50" />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d atrás`;
  if (day < 30) return `${Math.floor(day / 7)}sem atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function hashHue(str: string): number {
  // Hash simples pro avatar gradient
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}
