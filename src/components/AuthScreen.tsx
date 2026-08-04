import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../auth";

type Step = "email" | "otp" | "onboarding";

export function AuthScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>(() => {
    // If already logged in but no display name, start at onboarding
    if (session && profile && !profile.display_name) return "onboarding";
    return "email";
  });
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const sendingRef = useRef(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Transition to onboarding when logged in but missing display name
  useEffect(() => {
    if (session && profile && !profile.display_name) {
      setStep("onboarding");
    }
  }, [session, profile]);

  const sendCode = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;

    setError(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      sendingRef.current = false;
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    sendingRef.current = false;
    if (error) {
      setError(error.message);
      return;
    }
    setStep("otp");
    setCooldown(30);
  };

  const verify = async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    setError(null);
    const code = otp.join("").trim();
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      verifyingRef.current = false;
      return;
    }
    setLoading(true);
    const cleanEmail = email.trim();

    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: code,
      type: "magiclink",
    });

    setLoading(false);
    verifyingRef.current = false;

    if (error) {
      setError(error.message);
      return;
    }
    await refreshProfile();
  };

  const completeOnboarding = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError("Enter a display name");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", (await supabase.auth.getUser()).data.user?.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refreshProfile();
  };

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const next = pasted.split("").concat(Array(6 - pasted.length).fill("")).slice(0, 6);
      setOtp(next);
      otpRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  return (
    <div className="min-h-dvh w-full" style={{ backgroundColor: "var(--bg)" }}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
        <header className="mb-8 flex items-center gap-2.5">
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
          <span className="text-xl font-extrabold tracking-tight text-ink-900">Settl</span>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          {step === "email" && (
            <div className="card animate-slide-up p-7">
              <h1 className="text-2xl font-extrabold text-ink-900">Welcome to Settl</h1>
              <p className="mt-1.5 text-sm text-ink-500">
                Split group expenses and settle up in the fewest payments
                possible. Enter your email to get started.
              </p>
              <div className="mt-5 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-ink-700">
                    Email
                  </label>
                  <input
                    className="input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendCode()}
                    autoFocus
                  />
                </div>
                {error && <ErrorBanner message={error} />}
                <button
                  className="btn-primary w-full py-3.5"
                  onClick={sendCode}
                  disabled={loading}
                >
                  {loading ? "Sending…" : "Send code"}
                </button>
                <p className="text-center text-xs text-ink-400">
                  We'll email you a 6-digit verification code. New accounts are
                  created automatically.
                </p>
              </div>
            </div>
          )}

          {step === "otp" && (
            <div className="card animate-slide-up p-7">
              <button
                className="mb-4 text-sm font-semibold text-ink-500 hover:text-ink-800"
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setOtp(Array(6).fill(""));
                }}
              >
                ← Back
              </button>
              <h1 className="text-2xl font-extrabold text-ink-900">Enter verification code</h1>
              <p className="mt-1.5 text-sm text-ink-500">
                We sent a 6-digit code to{" "}
                <span className="font-semibold text-ink-700">{email}</span>. Enter the code below to sign in.
              </p>
              <div className="mt-5 space-y-4">
                <div
                  className="flex justify-between gap-2"
                  onPaste={handleOtpPaste}
                >
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      className="h-14 w-12 rounded-xl bg-surface-subtle text-center font-mono text-2xl font-bold text-ink-900 ring-1 ring-inset ring-ink-200 focus:ring-2 focus:ring-brand-500 focus:bg-surface transition"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                {error && <ErrorBanner message={error} />}
                <button
                  className="btn-primary w-full py-3.5"
                  onClick={verify}
                  disabled={loading}
                >
                  {loading ? "Verifying…" : "Verify"}
                </button>
                <div className="text-center text-sm">
                  {cooldown > 0 ? (
                    <span className="text-ink-400">
                      Resend code in {cooldown}s
                    </span>
                  ) : (
                    <button
                      className="font-semibold text-brand-700 hover:text-brand-800"
                      onClick={async () => {
                        await sendCode();
                      }}
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "onboarding" && (
            <div className="card animate-slide-up p-7">
              <h1 className="text-2xl font-extrabold text-ink-900">One last thing</h1>
              <p className="mt-1.5 text-sm text-ink-500">
                What should your group members call you? This is the name others
                will see on expenses and settlements.
              </p>
              <div className="mt-5 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-ink-700">
                    Display name
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. Riya"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && completeOnboarding()}
                    autoFocus
                  />
                </div>
                {error && <ErrorBanner message={error} />}
                <button
                  className="btn-primary w-full py-3.5"
                  onClick={completeOnboarding}
                  disabled={loading}
                >
                  {loading ? "Saving…" : "Get started →"}
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className="text-center text-xs text-ink-400">
          Settl · hackathon demo · no real money moves here
        </footer>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="animate-fade-in rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-500/30">
      {message}
    </div>
  );
}
