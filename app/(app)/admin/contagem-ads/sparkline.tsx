/**
 * Tiny 30-day sparkline. SVG, server-friendly (no client deps).
 */

export function Sparkline({
  data,
  width = 120,
  height = 32,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (!data || data.length === 0) {
    return <div className="text-[10.5px] text-text-3">sem histórico</div>;
  }
  if (data.length === 1) {
    return (
      <div className="flex items-center gap-1 text-[10.5px] text-text-3">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
        />
        {data[0]} ads (1 ponto)
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const last = data[data.length - 1];
  const first = data[0];
  const trending = last > first ? "up" : last < first ? "down" : "flat";

  const color =
    trending === "up" ? "#22C55E" : trending === "down" ? "#EF4444" : "#9CA3AF";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-label={`Histórico: ${first} → ${last}`}
    >
      <polygon points={areaPoints} fill={color} fillOpacity={0.08} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Último ponto destacado */}
      <circle
        cx={width}
        cy={height - ((last - min) / range) * height}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}
