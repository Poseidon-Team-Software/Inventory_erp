"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Part = {
  part_num: string;
  category: string;
  value: string | null;
  manufacturer: string | null;
  manufacturer_part_num: string | null;
  description: string | null;
  footprint: string | null;
};

const COLS = ["Part #", "Category", "Value", "Footprint", "Manufacturer", "Mfr Part #", "Description"] as const;

export default function PartsPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [mouserQuery, setMouserQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("parts")
      .select("part_num, category, value, manufacturer, manufacturer_part_num, description, footprint")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setParts(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = query.trim()
    ? parts.filter((p) =>
        [p.part_num, p.manufacturer_part_num, p.description, p.manufacturer]
          .some((f) => f?.toLowerCase().includes(query.toLowerCase()))
      )
    : parts;

  async function handleMouserImport() {
    const q = mouserQuery.trim();
    if (!q) return;

    setImporting(true);
    setImportStatus(null);

    const res = await fetch("/api/parts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });

    const json = await res.json();
    setImporting(false);

    if (!res.ok) {
      setImportStatus({ msg: json.error ?? "Mouser error", ok: false });
      return;
    }

    if (json.parts?.length > 0) {
      setParts((prev) => {
        const existing = new Set(prev.map((p) => p.part_num));
        const fresh = (json.parts as Part[]).filter((p) => !existing.has(p.part_num));
        return [...fresh, ...prev];
      });
      setImportStatus({ msg: `Imported ${json.parts.length} part(s) from Mouser`, ok: true });
      setMouserQuery("");
    } else {
      setImportStatus({ msg: "Not found on Mouser.", ok: false });
    }
  }

  return (
    <div className="pt-24 px-6 pb-12 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#1c1c1e] mb-6">Parts</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        {/* Local filter */}
        <input
          type="text"
          placeholder="Filter by part #, keyword, manufacturer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-48 max-w-sm px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-white text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
        />

        {/* Mouser import */}
        <div className="flex gap-2 flex-1 min-w-64 max-w-md">
          <input
            type="text"
            placeholder="Part # or keyword to import from Mouser…"
            value={mouserQuery}
            onChange={(e) => {
              setMouserQuery(e.target.value);
              setImportStatus(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleMouserImport()}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#ee8000]/40 bg-white text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
          />
          <button
            onClick={handleMouserImport}
            disabled={importing || !mouserQuery.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2 whitespace-nowrap"
          >
            {importing ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
            {importing ? "Searching…" : "Search Mouser"}
          </button>
        </div>
      </div>

      {importStatus && (
        <p className={`text-xs mb-4 ${importStatus.ok ? "text-[#ee8000]" : "text-red-500"}`}>
          {importStatus.msg}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[#1c1c1e]/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#1c1c1e]/50">
          {query.trim() ? "No matching parts in the database." : "No parts in the database yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1c1c1e]/10 shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#1c1c1e] text-white">
              <tr>
                {COLS.map((h) => (
                  <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.part_num}
                  className={`border-t border-[#1c1c1e]/10 ${i % 2 === 0 ? "bg-white" : "bg-[#fdf0e0]/60"} hover:bg-[#ee8000]/10 transition-colors`}
                >
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.part_num}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.category}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.value ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.footprint ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.manufacturer ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.manufacturer_part_num ?? "—"}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{p.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
