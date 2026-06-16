"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, animate } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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

    // Card rotates out on Y axis
    animate(cardRef.current!, { rotateY: 90, scale: 0.95 }, {
      duration: 0.4,
      ease: [0.55, 0, 1, 0.45],
    });

    // Overlay comes in slightly after, covering everything dark
    await new Promise<void>(r => setTimeout(r, 150));
    await animate(overlayRef.current!, { opacity: 1 }, { duration: 0.35, ease: "easeIn" });

    // Screen is fully dark — navigate seamlessly into the navbar animation
    router.push("/dashboard");
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#333333] bg-[url('/web_bg.png')] bg-cover bg-center"
      style={{ perspective: "1200px" }}
    >
      {/* Dark overlay — fades in on login success */}
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#1c1c1e",
          opacity: 0,
          zIndex: 50,
          pointerEvents: "none",
        }}
      />

      {/* Login card */}
      <motion.div
        ref={cardRef}
        className="relative z-10 w-full max-w-md rounded-3xl bg-white px-14 py-14 shadow-2xl"
      >
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
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-md outline-none transition-all focus:border-[#ee8000] focus:ring-2 focus:ring-[#ee8000]/30"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            {loading ? "..." : "LOGIN"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
