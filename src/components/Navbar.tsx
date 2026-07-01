"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, useAnimate, AnimatePresence } from "framer-motion";

const BREAKPOINT = 1024;
const EXPANDED_HEIGHT = 64 + 52 * 4 + 28; // top bar + 4 items + bottom padding

export default function Navbar() {
  const [scope, animate] = useAnimate();
  const logoRef = useRef<HTMLDivElement>(null);
  const whiteLayerRef = useRef<HTMLDivElement>(null);
  const [showContent, setShowContent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const targetWidth = window.innerWidth * 0.5;
    const diagonal = Math.ceil(Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2));
    const initialY = window.innerHeight / 2 - 16 - diagonal / 2;

    async function sequence() {
      if (!scope.current || !logoRef.current || !whiteLayerRef.current) return;
      await Promise.all([
        animate(scope.current, { top: "1rem", y: initialY, width: diagonal, height: diagonal, borderRadius: diagonal / 2 }, { duration: 0 }),
        animate(logoRef.current!, { scale: 4 }, { duration: 0 }),
      ]);
      await animate(logoRef.current!, { opacity: 1 }, { duration: 0.3, ease: "easeOut" });
      animate(whiteLayerRef.current!, { clipPath: "inset(0 100% 0 0)" }, { duration: 0.7, ease: [0.4, 0, 0.2, 1] });
      await new Promise<void>((r) => setTimeout(r, 800));
      await Promise.all([
        animate(scope.current, { y: 0, width: 56, height: 56, borderRadius: 28 }, { duration: 0.55, ease: [0.76, 0, 0.24, 1] }),
        animate(logoRef.current!, { scale: 0.45 }, { duration: 0.55, ease: [0.76, 0, 0.24, 1] }),
      ]);
      await new Promise<void>((r) => setTimeout(r, 120));
      const logoX = 24 - (targetWidth - 36) / 2;
      await Promise.all([
        animate(scope.current, { width: targetWidth, height: 64, borderRadius: 50 }, { duration: 0.65, ease: [0.37, 0, 0.63, 1] }),
        animate(logoRef.current!, { scale: 1, x: logoX }, { duration: 0.65, ease: [0.37, 0, 0.63, 1] }),
      ]);
      if (!isMounted) return;
      setShowContent(true);
      setIsMobile(window.innerWidth < BREAKPOINT);
      animate(logoRef.current!, { x: 0 }, { duration: 0 });
    }

    sequence();
    return () => { isMounted = false; };
  }, [animate]);

  useEffect(() => {
    if (!showContent) return;
    function onResize() {
      if (!scope.current) return;
      const newIsMobile = window.innerWidth < BREAKPOINT;
      animate(scope.current, { width: window.innerWidth * 0.5, height: 64 }, { duration: 0.3, ease: [0.37, 0, 0.63, 1] });
      setIsMobile(newIsMobile);
      if (!newIsMobile) setNavOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [showContent, animate]);

  useEffect(() => {
    if (!showContent || !scope.current) return;
    animate(scope.current, { height: navOpen ? EXPANDED_HEIGHT : 64 }, {
      duration: 0.35,
      delay: navOpen ? 0 : 0.18,
      ease: [0.37, 0, 0.63, 1],
    });
  }, [navOpen, showContent, animate]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <motion.div
      ref={scope}
      initial={{ x: "-50%", opacity: 1 }}
      style={{
        position: "fixed",
        top: 0,
        left: "50%",
        width: "100vw",
        height: "100vh",
        zIndex: 50,
        backgroundColor: "#1c1c1e",
        display: "flex",
        alignItems: showContent ? "flex-start" : "center",
        justifyContent: showContent ? "flex-start" : "center",
        paddingTop: showContent ? 14 : 0,
        paddingLeft: showContent ? 24 : 0,
        paddingRight: showContent ? 24 : 0,
        overflow: "visible",
      }}
      className={showContent ? "group" : ""}
    >
      {showContent && (
        <div className="absolute inset-0 rounded-[50px] bg-[#1c1c1e] group-hover:scale-105 transition-transform duration-300 ease-out" />
      )}

      <motion.div
        ref={logoRef}
        initial={{ opacity: 0 }}
        style={{ position: "relative", zIndex: 1, flexShrink: 0 }}
      >
        <Link href="/dashboard" style={{ display: "block", position: "relative" }}>
          <Image src="/logo_mark_orange.png" alt="Logo" width={36} height={36} className="object-contain" />
          <div
            ref={whiteLayerRef}
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, clipPath: "inset(0 0% 0 0)" }}
          >
            <Image src="/logo_mark_orange.png" alt="" width={36} height={36} className="object-contain" style={{ filter: "brightness(0) invert(1)" }} />
          </div>
        </Link>
      </motion.div>

      <AnimatePresence>
        {showContent && !isMobile && (
          <motion.div
            key="links"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: "50%",
              top: 32,
              transform: "translate(-50%, -50%)",
              display: "flex",
              gap: 32,
              zIndex: 1,
            }}
          >
            <Link href="/projects" className="text-white/80 text-base hover:text-white transition-colors underline-offset-4 hover:underline decoration-[#ee8000] whitespace-nowrap">projects</Link>
            <Link href="/inventory" className="text-white/80 text-base hover:text-white transition-colors underline-offset-4 hover:underline decoration-[#ee8000] whitespace-nowrap">inventory</Link>
            <Link href="/parts" className="text-white/80 text-base hover:text-white transition-colors underline-offset-4 hover:underline decoration-[#ee8000] whitespace-nowrap">parts</Link>
            <Link href="/locations" className="text-white/80 text-base hover:text-white transition-colors underline-offset-4 hover:underline decoration-[#ee8000] whitespace-nowrap">locations</Link>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContent && isMobile && (
          <motion.button
            key="chevron"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            onClick={() => setNavOpen((v) => !v)}
            style={{
              position: "absolute",
              left: "50%",
              top: 32,
              transform: "translate(-50%, -50%)",
              zIndex: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <motion.svg
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              animate={{ rotate: navOpen ? 180 : 0 }}
              transition={{ duration: 0.3, ease: [0.37, 0, 0.63, 1] }}
            >
              <polyline points="6 9 12 15 18 9" />
            </motion.svg>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContent && (
          <motion.div
            key="profile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ position: "absolute", right: 24, top: 32, transform: "translateY(-50%)", zIndex: 1 }}
            ref={menuRef}
          >
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="group/btn flex items-center justify-center w-9 h-9 rounded-full border border-[#ee8000]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-white group-hover/btn:stroke-[#ee8000] transition-colors duration-200">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-3 w-44 bg-[#1c1c1e] rounded-2xl border border-[#ee8000]/30 shadow-2xl overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  onClick={() => { setMenuOpen(false); router.push("/profile"); }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Profile
                </button>
                <div className="h-px bg-[#ee8000]/35" />
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#ee8000] hover:text-[#ee8000]/80 hover:bg-white/5 transition-colors"
                  onClick={handleLogout}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContent && isMobile && navOpen && (
          <motion.div
            key="mobile-nav"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.25, ease: "easeOut" } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeIn" } }}
            style={{
              position: "absolute",
              top: 64,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              padding: "8px 24px 16px",
              zIndex: 1,
            }}
          >
            <Link href="/projects" onClick={() => setNavOpen(false)} className="text-white/80 hover:text-white transition-colors" style={{ padding: "11px 0", fontSize: 16, borderBottom: "1px solid rgba(238,128,0,0.35)" }}>projects</Link>
            <Link href="/inventory" onClick={() => setNavOpen(false)} className="text-white/80 hover:text-white transition-colors" style={{ padding: "11px 0", fontSize: 16, borderBottom: "1px solid rgba(238,128,0,0.35)" }}>inventory</Link>
            <Link href="/parts" onClick={() => setNavOpen(false)} className="text-white/80 hover:text-white transition-colors" style={{ padding: "11px 0", fontSize: 16, borderBottom: "1px solid rgba(238,128,0,0.35)" }}>parts</Link>
            <Link href="/locations" onClick={() => setNavOpen(false)} className="text-white/80 hover:text-white transition-colors" style={{ padding: "11px 0", fontSize: 16 }}>locations</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
