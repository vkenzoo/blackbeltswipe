import { cn } from "@/lib/utils";

/**
 * Skeleton base — pulse animation with glass surface.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-40 w-full rounded-[var(--r-lg)]" />
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[6px]",
        "bg-[var(--bg-glass)]",
        "animate-pulse",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * Skeleton card — matches the general glass card shape usado em /admin/offers
 * e outras grids. Passe count pra renderizar múltiplos.
 */
export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-3"
          aria-hidden="true"
        >
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </>
  );
}

/**
 * Skeleton specific to edit-offer loading state.
 */
export function SkeletonEditForm() {
  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 max-w-[960px] mx-auto">
      {/* Back link */}
      <Skeleton className="h-4 w-28" />

      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-3 w-40" />
      </div>

      {/* 3 sections — title, video, transcript */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="glass rounded-[var(--r-lg)] p-6 flex flex-col gap-4"
          aria-hidden="true"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ))}

      {/* Actions row */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>
    </div>
  );
}
