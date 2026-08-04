const palette = [
  "bg-brand-500/20 text-brand-700",
  "bg-amber-500/20 text-amber-700",
  "bg-sky-500/20 text-sky-700",
  "bg-rose-500/20 text-rose-700",
  "bg-violet-500/20 text-violet-700",
  "bg-emerald-500/20 text-emerald-700",
  "bg-orange-500/20 text-orange-700",
  "bg-cyan-500/20 text-cyan-700",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  id,
  size = "md",
}: {
  name: string;
  id: string;
  size?: "sm" | "md" | "lg";
}) {
  const color = palette[hash(id) % palette.length];
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${color} ${sizes[size]}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  members,
  max = 4,
  size = "sm",
}: {
  members: { id: string; name: string }[];
  max?: number;
  size?: "sm" | "md";
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((m) => (
        <span key={m.id} className="ring-2 ring-surface rounded-full">
          <Avatar name={m.name} id={m.id} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`inline-flex items-center justify-center rounded-full bg-ink-200 font-bold text-ink-600 ring-2 ring-surface ${
            size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs"
          }`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
