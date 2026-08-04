import { useState } from "react";
import type { Group, GroupMember, Tab } from "../types";
import { Avatar } from "./Avatar";
import { useAuth } from "../auth";
import { useTheme } from "../theme";

const tabs: { id: Tab; label: string }[] = [
  { id: "expenses", label: "Expenses" },
  { id: "settle", label: "Settle Up" },
  { id: "reminders", label: "Reminders" },
];

export function TopNav({
  group,
  members,
  active,
  onChange,
  onLeave,
  badge,
}: {
  group: Group;
  members: GroupMember[];
  active: Tab;
  onChange: (t: Tab) => void;
  onLeave: () => void;
  badge?: Partial<Record<Tab, number>>;
}) {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.length - activeCount;

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-surface/85 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Row 1 */}
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold leading-tight text-ink-900">
                {group.name}
              </h1>
              <div className="text-xs text-ink-500">
                {activeCount} active{pendingCount > 0 ? ` · ${pendingCount} invited` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-ghost shrink-0 p-2"
              onClick={toggle}
              title={theme === "light" ? "Switch to dark" : "Switch to light"}
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
            <button
              className="btn-ghost shrink-0 px-3 py-2 text-sm"
              onClick={onLeave}
              title="Back to groups"
            >
              Groups
            </button>
            {profile && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full p-0.5 ring-2 ring-transparent transition hover:ring-brand-200"
                >
                  <Avatar
                    name={profile.display_name ?? profile.email}
                    id={profile.id}
                    size="md"
                  />
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="animate-scale-in absolute right-0 top-12 z-20 w-56 rounded-xl bg-surface p-2 shadow-cardHover ring-1 ring-ink-200">
                      <div className="border-b border-ink-100 px-3 py-2">
                        <p className="truncate text-sm font-bold text-ink-800">
                          {profile.display_name ?? "No name set"}
                        </p>
                        <p className="truncate text-xs text-ink-400">
                          {profile.email}
                        </p>
                      </div>
                      <button
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100"
                        onClick={() => {
                          setMenuOpen(false);
                          signOut();
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Log out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: tabs */}
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => {
            const isActive = active === t.id;
            const count = badge?.[t.id];
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`relative flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  isActive
                    ? "border-brand-700 text-brand-700"
                    : "border-transparent text-ink-500 hover:text-ink-800"
                }`}
              >
                {t.label}
                {count ? (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      isActive
                        ? "bg-brand-500/15 text-brand-700"
                        : "bg-ink-200 text-ink-600"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
