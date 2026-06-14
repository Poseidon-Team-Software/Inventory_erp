"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#333333] bg-[url('/web_bg.png')] bg-cover bg-center">
      {/* Login card */}
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-white px-14 py-14 shadow-2xl">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <Image src="/logo.png" alt="Poseidon Racing Team" width={300} height={300} priority />
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-md outline-none transition-all focus:border-[#ff8000] focus:ring-2 focus:ring-[#ff8000]/30"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-md outline-none transition-all focus:border-[#ff8000] focus:ring-2 focus:ring-[#ff8000]/30"
          />

          {error && (
            <p className="text-center text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-[#333333] py-4 font-display text-sm tracking-[0.2em] text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {loading ? "..." : "LOGIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
