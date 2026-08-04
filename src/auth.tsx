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
      console.log("[AUTH] fetchProfile called for uid:", uid);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .eq("id", uid)
        .maybeSingle();

      console.log("[AUTH] fetchProfile result:", { data, error: error?.message || null, errorCode: error?.code || null });

      if (error) {
        // Only sign out on JWT/auth errors, NOT on missing table or RLS issues
        const msg = error.message?.toLowerCase() || "";
        if (msg.includes("jwt") || error.code === "PGRST301") {
          console.log("[AUTH] JWT error — signing out");
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          return;
        }
        // For other errors (RLS, missing table, etc.), fall through to
        // create a temporary profile from session data
        console.log("[AUTH] Non-JWT error, creating temporary profile");
      }

      if (data) {
        console.log("[AUTH] Profile found:", data);
        setProfile(data as Profile);
        return;
      }

      // Profile row doesn't exist yet — build a temporary profile from the
      // session data so the UI can proceed to the onboarding step.
      if (userEmail) {
        console.log("[AUTH] No profile row — using temporary profile");
        setProfile({ id: uid, email: userEmail, display_name: null });
        return;
      }

      setProfile(null);
    } catch (e) {
      console.log("[AUTH] fetchProfile exception:", e);
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      console.log("[AUTH] getSession:", { hasSession: !!data.session, userId: data.session?.user?.id });
      setSession(data.session);
      if (data.session?.user) {
        fetchProfile(data.session.user.id, data.session.user.email).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      console.log("[AUTH] onAuthStateChange:", { event: _event, hasSession: !!sess, userId: sess?.user?.id });
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
    console.log("[AUTH] refreshProfile called");
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    console.log("[AUTH] refreshProfile getSession:", { hasSession: !!currentSession, userId: currentSession?.user?.id });
    if (currentSession?.user) {
      setSession(currentSession);
      await fetchProfile(currentSession.user.id, currentSession.user.email);
    } else {
      console.log("[AUTH] refreshProfile — no session found");
    }
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
