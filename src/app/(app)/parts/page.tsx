"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import SelectDropdown from "@/components/SelectDropdown";

// ── Mouser detail fields already shown in the core cards above
const SKIP_KEYS = new Set([
  "ImagePath", "DataSheetUrl", "MouserPartNumber", "ManufacturerPartNumber",
  "Manufacturer", "Description", "Category", "PriceBreaks", "ProductAttributes",
  "InfoMessages", "SurchargeMessages", "MultiSimBlue", "TradeCompliance",
  "ProductCompliance", "AlternatePackagings", "ProductDetailUrl",
]);

const LABEL: Record<string, string> = {
  Min: "Min Order Qty",
  Mult: "Order Multiple",
  Reeling: "Reeling",
  LeadTime: "Lead Time",
  ROHSStatus: "RoHS Status",
  Availability: "Availability",
  FactoryStock: "Factory Stock",
  LifecycleStatus: "Lifecycle",
  AvailabilityInStock: "In Stock",
  AvailabilityOnOrder: "On Order",
  SuggestedReplacement: "Suggested Replacement",
  ProductDetailUrl: "Product URL",
};

function MouserDataTable({ data }: { data: Record<string, unknown> }) {
  const scalars = Object.entries(data).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== "" && !Array.isArray(v) && typeof v !== "object"
  ) as [string, string][];

  const attrs = (data.ProductAttributes as Array<Record<string, string>> | undefined)
    ?.filter((a) => a.AttributeName && a.AttributeValue && !a.AttributeCost);

  return (
    <div className="space-y-4">
      {/* Scalar fields */}
      {scalars.length > 0 && (
        <div className="rounded-xl border border-[#1c1c1e]/10 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {scalars.map(([key, val], i) => (
                <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-[#f5f5f7]"}>
                  <td className="px-4 py-2.5 text-[#1c1c1e]/50 text-xs font-medium w-2/5 whitespace-nowrap border-r border-[#1c1c1e]/5">
                    {LABEL[key] ?? key}
                  </td>
                  <td className="px-4 py-2.5 text-[#1c1c1e] text-xs break-all">
                    {key === "ProductDetailUrl" ? (
                      <a href={String(val)} target="_blank" rel="noopener noreferrer" className="text-[#ee8000] hover:underline">Open ↗</a>
                    ) : String(val)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Attributes */}
      {attrs && attrs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[#1c1c1e]/40 uppercase tracking-widest mb-2">Product Attributes</p>
          <div className="rounded-xl border border-[#1c1c1e]/10 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {attrs.map((a, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f5f5f7]"}>
                    <td className="px-4 py-2.5 text-[#1c1c1e]/50 text-xs font-medium w-2/5 border-r border-[#1c1c1e]/5">{a.AttributeName}</td>
                    <td className="px-4 py-2.5 text-[#1c1c1e] text-xs">{a.AttributeValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Category icons ────────────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: string }) {
  const s = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.5,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (category) {
    case "Resistor":
      return <svg {...s}><path d="M1 12h4M19 12h4"/><rect x="5" y="8" width="14" height="8" rx="1"/></svg>;
    case "Thermistor":
      return <svg {...s}><path d="M1 12h4M19 12h4"/><rect x="5" y="8" width="14" height="8" rx="1"/><path d="M15 16 L19 8" strokeWidth="1.2"/></svg>;
    case "Capacitor":
      return <svg {...s}><path d="M1 12h9M14 12h9M10 4v16M14 4v16"/></svg>;
    case "Inductor":
      return <svg {...s}><path d="M1 12h1.5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0h1.5"/></svg>;
    case "Diode":
      return <svg {...s}><path d="M1 12h7M16 12h7M16 5v14"/><polygon points="8,5 8,19 16,12" fill="currentColor" fillOpacity="0.15"/></svg>;
    case "LED":
      return <svg {...s}><path d="M1 12h6M14 12h5M14 5v14"/><polygon points="7,5 7,19 14,12" fill="currentColor" fillOpacity="0.15"/><path d="M17 4l3-3M20 7l3-3" strokeWidth="1.2"/></svg>;
    case "Transistor":
      return <svg {...s}><circle cx="14" cy="12" r="7"/><path d="M1 12h5M7 7v10M7 9l7-4M7 15l7 4"/></svg>;
    case "MOSFET":
      return <svg {...s}><circle cx="14" cy="12" r="7"/><path d="M1 12h5M9 5v14M12 5v5M12 14v5M9 12h3M12 8h9M12 16h9"/></svg>;
    case "IC":
      return <svg {...s}><rect x="6" y="4" width="12" height="16" rx="1"/><path d="M1 8h5M1 12h5M1 16h5M18 8h5M18 12h5M18 16h5"/></svg>;
    case "Op_Amp":
      return <svg {...s}><path d="M3 4v16l17-8z"/><path d="M1 8h2M1 16h2M20 12h3M8 9h3M8 15h3"/></svg>;
    case "Voltage_Regulator":
      return <svg {...s}><rect x="6" y="5" width="12" height="14" rx="1"/><path d="M1 10h5M1 14h5M18 12h5"/><path d="M11 9v6M14 9v6" strokeWidth="1.2"/></svg>;
    case "Logic":
      return <svg {...s}><path d="M4 6h8c5 0 9 2.7 9 6s-4 6-9 6H4z"/><path d="M1 9h3M1 15h3M21 12h2"/></svg>;
    case "Gate_Driver":
      return <svg {...s}><path d="M3 4v16l15-8z"/><path d="M1 12h2M18 12h5M10 10h3M10 14h3"/></svg>;
    case "ADC_DAC":
      return <svg {...s}><path d="M1 12C3 6 5 6 7 12S11 18 13 12"/><path d="M15 7h2v10h3V7h2"/></svg>;
    case "Connector":
      return <svg {...s}><rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="7" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="17" cy="12" r="1.5" fill="currentColor"/></svg>;
    case "Crystal":
      return <svg {...s}><path d="M1 12h5M18 12h5"/><rect x="6" y="6" width="12" height="12"/><path d="M10 6v12M14 6v12"/></svg>;
    case "Switch":
      return <svg {...s}><circle cx="7" cy="12" r="1.5" fill="currentColor"/><circle cx="17" cy="12" r="1.5" fill="currentColor"/><path d="M1 12h5M8.5 12l6.5-5M18.5 12h4.5"/></svg>;
    case "Fuse":
      return <svg {...s}><path d="M1 12h4M19 12h4"/><rect x="5" y="9" width="14" height="6" rx="3"/><path d="M12 9v6"/></svg>;
    case "Sensor":
      return <svg {...s}><path d="M1 12C1 6.5 23 6.5 23 12S1 17.5 1 12"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>;
    default:
      return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>;
  }
}

type Part = {
  part_num: string;
  category: string;
  value: string | null;
  manufacturer: string | null;
  manufacturer_part_num: string | null;
  description: string | null;
  footprint: string | null;
  datasheet_url: string | null;
  image: string | null;
  mouser_details: Record<string, unknown> | null;
};

const COLS = ["", "Part #", "Category", "Value", "Footprint", "Manufacturer", "Mfr Part #", ""] as const;

export default function PartsPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Part | null>(null);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [valueFilter, setValueFilter] = useState("");
  const [footprintFilter, setFootprintFilter] = useState<string[]>([]);

  const [mouserQuery, setMouserQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  function copyPartNum(partNum: string) {
    navigator.clipboard.writeText(partNum);
    setCopiedId(partNum);
    setTimeout(() => setCopiedId(null), 1500);
  }

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("parts")
      .select("part_num, category, value, manufacturer, manufacturer_part_num, description, footprint, datasheet_url, image, mouser_details")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setParts((data as Part[]) ?? []);
        setLoading(false);
      });
  }, []);

  const categories = [...new Set(parts.map((p) => p.category))].sort();

  // Values scoped to the selected category (or all if none selected)
  const categoryParts = categoryFilter ? parts.filter((p) => p.category === categoryFilter) : parts;
  const values    = [...new Set(categoryParts.map((p) => p.value).filter(Boolean))].sort() as string[];
  const footprints = [...new Set(categoryParts.map((p) => p.footprint).filter(Boolean))].sort() as string[];

  const filtered = parts.filter((p) => {
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (valueFilter    && p.value    !== valueFilter)    return false;
    if (footprintFilter.length > 0 && !footprintFilter.includes(p.footprint ?? "")) return false;
    if (query.trim()) {
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      const fields = [p.part_num, p.manufacturer_part_num, p.description, p.manufacturer, p.category, p.value];
      if (!tokens.every((tok) => fields.some((f) => f?.toLowerCase().includes(tok)))) return false;
    }
    return true;
  });

  const activeFilters = [categoryFilter, valueFilter].filter(Boolean).length + (footprintFilter.length > 0 ? 1 : 0);

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
        <input
          type="text"
          placeholder="Filter by part #, keyword, manufacturer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-48 max-w-sm px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-white text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
        />
        <div className="flex gap-2 flex-1 min-w-64 max-w-md">
          <input
            type="text"
            placeholder="Part # or keyword to import from Mouser…"
            value={mouserQuery}
            onChange={(e) => { setMouserQuery(e.target.value); setImportStatus(null); }}
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
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
            {importing ? "Searching…" : "Search Mouser"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="min-w-44">
          <SelectDropdown
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setValueFilter(""); setFootprintFilter([]); }}
            placeholder="All categories"
            nullLabel="All categories"
            options={categories.map((c) => ({ value: c, label: c, icon: <CategoryIcon category={c} /> }))}
          />
        </div>

        <div className="min-w-36">
          <SelectDropdown
            value={valueFilter}
            onChange={setValueFilter}
            placeholder="All values"
            nullLabel="All values"
            options={values.map((v) => ({ value: v, label: v }))}
          />
        </div>

        <div className="min-w-44">
          <SelectDropdown
            multiSelect
            value={footprintFilter}
            onChange={setFootprintFilter}
            placeholder="All footprints"
            nullLabel="All footprints"
            options={footprints.map((f) => ({ value: f, label: f }))}
          />
        </div>

        {activeFilters > 0 && (
          <button
            onClick={() => { setCategoryFilter(""); setValueFilter(""); setFootprintFilter([]); }}
            className="px-3 py-2 rounded-xl text-sm text-[#1c1c1e]/50 hover:text-[#ee8000] hover:bg-[#ee8000]/10 transition flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear filters
          </button>
        )}
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
                {COLS.map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.part_num}
                  className={`border-t border-[#1c1c1e]/10 ${i % 2 === 0 ? "bg-white" : "bg-[#fdf0e0]/60"} hover:bg-[#ee8000]/10 transition-colors`}
                >
                  {/* Copy button */}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => copyPartNum(p.part_num)}
                      title="Copy part number"
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[#1c1c1e]/30 hover:text-[#ee8000] hover:bg-[#ee8000]/10 transition-colors"
                    >
                      {copiedId === p.part_num ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#ee8000]">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.part_num}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.category}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.value ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.footprint ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.manufacturer ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.manufacturer_part_num ?? "—"}</td>
                  {/* Details button */}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => setSelected(p)}
                      title="View details"
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[#1c1c1e]/30 hover:text-[#ee8000] hover:bg-[#ee8000]/10 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Part Detail Modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-[#1c1c1e]/10">
              <div>
                <p className="font-mono text-xs text-[#1c1c1e]/40 mb-1">{selected.part_num}</p>
                <h2 className="text-lg font-semibold text-[#1c1c1e] leading-snug">{selected.description ?? "No description"}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="ml-4 shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[#1c1c1e]/40 hover:text-[#1c1c1e] hover:bg-[#1c1c1e]/5 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Core fields */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Category",     selected.category],
                  ["Value",        selected.value],
                  ["Footprint",    selected.footprint],
                  ["Manufacturer", selected.manufacturer],
                  ["Mfr Part #",   selected.manufacturer_part_num],
                ].map(([label, val]) => (
                  <div key={label} className="bg-[#f5f5f7] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-[#1c1c1e]/40 uppercase tracking-widest mb-1">{label}</p>
                    <p className="text-sm text-[#1c1c1e] font-medium break-all">{val ?? "—"}</p>
                  </div>
                ))}
                {selected.datasheet_url && (
                  <div className="bg-[#f5f5f7] rounded-xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-[#1c1c1e]/40 uppercase tracking-widest mb-1">Datasheet</p>
                    <a
                      href={selected.datasheet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#ee8000] hover:underline font-medium"
                    >
                      Open PDF ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Mouser Data */}
              {selected.mouser_details && (
                <div>
                  <p className="text-[10px] font-semibold text-[#1c1c1e]/40 uppercase tracking-widest mb-2">Mouser Data</p>
                  <MouserDataTable data={selected.mouser_details} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
