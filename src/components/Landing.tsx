import { useEffect, useRef, useState } from "react";
import type { Group, GroupMember } from "../types";
import { useAuth } from "../auth";
import {
  createGroup,
  fetchGroupMembers,
  fetchUserGroups,
  inviteMember,
  activateMember,
} from "../data";
import { Avatar } from "./Avatar";

export function Landing({
  onOpenGroup,
}: {
  onOpenGroup: (group: Group) => void;
}) {
  const { profile, user, signOut } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const gs = await fetchUserGroups();
      setGroups(gs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [user]);

  const handleCreated = (g: Group) => {
    setGroups((prev) => [g, ...prev]);
    onOpenGroup(g);
  };

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: "var(--bg)" }}>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-xl font-extrabold tracking-tight text-ink-900">
              Settl
            </span>
          </div>
          {profile && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Avatar
                  name={profile.display_name ?? profile.email}
                  id={profile.id}
                  size="md"
                />
                <span className="hidden text-sm font-bold text-ink-700 sm:inline">
                  {profile.display_name ?? profile.email}
                </span>
              </div>
              <button
                onClick={() => signOut()}
                className="btn-soft px-3 py-1.5 text-xs font-bold text-ink-600 hover:text-ink-900"
                title="Log out"
              >
                Log out
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
              Pranil Changed this from Your groups
            </h1>
            <p className="mt-1 text-ink-500">
              Create a new event or jump back into an existing one.
            </p>
          </div>

          {loading ? (
            <div className="card p-10 text-center text-ink-500">Loading your groups…</div>
          ) : error ? (
            <div className="card p-6 text-center text-rose-600">
              {error}
              <button className="btn-soft mt-3 px-4 py-2" onClick={loadGroups}>Retry</button>
            </div>
          ) : (
            <>
              <CreateGroupCard onCreated={handleCreated} />

              {groups.length > 0 ? (
                <div className="mt-6 space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">
                    Existing groups
                  </h2>
                  {groups.map((g) => (
                    <GroupRow key={g.id} group={g} onOpen={onOpenGroup} />
                  ))}
                </div>
              ) : (
                <div className="mt-6 card p-8 text-center text-ink-500">
                  <p className="font-semibold">No groups yet</p>
                  <p className="text-sm">Create your first group above to start splitting expenses.</p>
                </div>
              )}
            </>
          )}
        </main>

        <footer className="text-center text-xs text-ink-400">
          Settl · hackathon demo · no real money moves here
        </footer>
      </div>
    </div>
  );
}

function CreateGroupCard({
  onCreated,
}: {
  onCreated: (g: Group) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [invites, setInvites] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addInvite = () => {
    const v = emailInput.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    if (invites.some((e) => e.toLowerCase() === v.toLowerCase())) {
      setEmailInput("");
      return;
    }
    setInvites((prev) => [...prev, v]);
    setEmailInput("");
    inputRef.current?.focus();
  };

  const removeInvite = (email: string) =>
    setInvites((prev) => prev.filter((e) => e !== email));

  const canCreate = name.trim().length > 0 && !creating;

  const handleCreate = async () => {
    if (!canCreate || !user) return;
    setCreating(true);
    setError(null);
    try {
      const group = await createGroup(name.trim(), user.id);
      // Invite the creator as a member, then activate immediately
      await inviteMember(group.id, user.email ?? "");
      await activateMember(group.id, user.email ?? "", user.id);
      // Invite all other emails as pending
      for (const email of invites) {
        await inviteMember(group.id, email);
      }
      onCreated(group);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="card animate-slide-up p-6">
      <h2 className="text-lg font-extrabold text-ink-900">Create a new group</h2>
      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-ink-700">
            Group name
          </label>
          <input
            className="input"
            placeholder="e.g. Goa Trip"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold text-ink-700">
            Invite members by email
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input"
              type="email"
              placeholder="friend@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInvite();
                }
              }}
            />
            <button className="btn-soft shrink-0 px-4" onClick={addInvite}>
              Invite
            </button>
          </div>

          {invites.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {invites.map((email) => (
                <span
                  key={email}
                  className="chip animate-scale-in bg-amber-500/15 text-amber-700 ring-amber-500/30"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {email}
                  <button
                    className="ml-0.5 text-amber-500 hover:text-amber-700"
                    onClick={() => removeInvite(email)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-400">
            Invited members become active when they sign up with that email.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-500/30">
            {error}
          </div>
        )}

        <button
          className="btn-primary w-full py-3.5"
          disabled={!canCreate}
          onClick={handleCreate}
        >
          {creating ? "Creating…" : "Create group →"}
        </button>
      </div>
    </div>
  );
}

function GroupRow({
  group,
  onOpen,
}: {
  group: Group;
  onOpen: (g: Group) => void;
}) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    fetchGroupMembers(group.id)
      .then((m) => {
        setMembers(m);
        setMemberCount(m.length);
      })
      .catch(() => setMemberCount(null));
  }, [group.id]);

  const activeMembers = members.filter((m) => m.status === "active");

  return (
    <button
      onClick={() => onOpen(group)}
      className="card flex w-full items-center gap-4 p-4 text-left transition hover:shadow-cardHover"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-700">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold text-ink-900">{group.name}</h3>
        <p className="text-xs text-ink-500">
          {memberCount !== null
            ? `${activeMembers.length} active${members.length - activeMembers.length > 0
              ? ` · ${members.length - activeMembers.length} invited`
              : ""
            }`
            : "Loading…"}
        </p>
      </div>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0 text-ink-400"
      >
        <path
          d="M9 18l6-6-6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
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
  );
}
