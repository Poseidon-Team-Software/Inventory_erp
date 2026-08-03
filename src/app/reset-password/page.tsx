"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    // The reset link's tokens are in the URL hash; the Supabase client picks
    // them up on load and fires PASSWORD_RECOVERY once a session is set.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setReady(true);
      }
    });

    const timer = setTimeout(() => {
      if (!settled) setInvalid(true);
    }, 3000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#333333] bg-[url('/web_bg.png')] bg-cover bg-center"
      style={{ perspective: "1200px" }}
    >
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-white px-14 py-14 shadow-2xl">
        <div className="mb-10 flex justify-center">
          <Image src="/logo.png" alt="Poseidon Racing Team" width={300} height={300} priority />
        </div>

        {invalid ? (
          <div className="flex flex-col gap-5 text-center">
            <p className="text-sm text-[#1c1c1e]/70">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/"
              className="mt-2 w-full rounded-xl bg-[#333333] py-4 font-display text-sm tracking-[0.2em] text-white transition-opacity hover:opacity-80 text-center"
            >
              BACK TO LOGIN
            </Link>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-[#1c1c1e]/50">Verifying reset link…</p>
        ) : done ? (
          <div className="flex flex-col gap-5 text-center">
            <p className="text-sm text-[#1c1c1e]/70">Your password has been updated.</p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-2 w-full rounded-xl bg-[#333333] py-4 font-display text-sm tracking-[0.2em] text-white transition-opacity hover:opacity-80"
            >
              CONTINUE
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-md outline-none transition-all focus:border-[#ee8000] focus:ring-2 focus:ring-[#ee8000]/30"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-md outline-none transition-all focus:border-[#ee8000] focus:ring-2 focus:ring-[#ee8000]/30"
            />

            {error && (
              <p className="text-center text-xs text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-[#333333] py-4 font-display text-sm tracking-[0.2em] text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {loading ? "..." : "RESET PASSWORD"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
