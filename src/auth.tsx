import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string, userEmail?: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .eq("id", uid)
        .maybeSingle();

      // If token is invalid/expired or RLS denied (42501/PGRST301/JWT error), clear stale session
      if (error && (error.code === "42501" || error.code === "PGRST301" || error.message?.toLowerCase().includes("jwt") || error.message?.toLowerCase().includes("forbidden"))) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        return;
      }

      if (data) {
        setProfile(data as Profile);
        return;
      }

      // Fallback: If profile row doesn't exist yet in public.profiles, create it
      if (!data && userEmail) {
        const { data: created, error: createErr } = await supabase
          .from("profiles")
          .upsert({ id: uid, email: userEmail }, { onConflict: "id" })
          .select("id, email, display_name")
          .maybeSingle();

        if (createErr && (createErr.code === "42501" || createErr.code === "PGRST301" || createErr.message?.toLowerCase().includes("jwt"))) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          return;
        }

        if (created) {
          setProfile(created as Profile);
          return;
        }
      }
      setProfile(null);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchProfile(data.session.user.id, data.session.user.email).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        if (sess?.user) {
          await fetchProfile(sess.user.id, sess.user.email);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id, session.user.email);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
