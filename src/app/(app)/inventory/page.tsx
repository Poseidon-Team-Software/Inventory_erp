"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import SelectDropdown from "@/components/SelectDropdown";

// ── Types ─────────────────────────────────────────────────────────────────────

type InventoryRow = {
  entry_id: string;
  quantity: number;
  min_quantity: number;
  last_updated: string;
  parts: {
    part_num: string;
    category: string;
    description: string | null;
    manufacturer: string | null;
    manufacturer_part_num: string | null;
    value: string | null;
    footprint: string | null;
  } | null;
  boxes: { name: string } | null;
};

type Part = {
  part_num: string;
  category: string;
  description: string | null;
  manufacturer: string | null;
  value: string | null;
};

type Box = {
  box_id: string;
  name: string;
  description: string | null;
  colour: string | null;
};

const COLS = [
  "Part #", "Category", "Description", "Manufacturer",
  "Value", "Footprint", "Qty", "Min Qty", "Location",
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [allParts, setAllParts] = useState<Part[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [showPartDrop, setShowPartDrop] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [minQty, setMinQty] = useState(0);
  const [locationId, setLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const partDropRef = useRef<HTMLDivElement>(null);

  // ── Data fetch ────────────────────────────────────────────────────────────

  async function fetchInventory(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase
      .from("inventory")
      .select(`
        entry_id, quantity, min_quantity, last_updated,
        parts ( part_num, category, description, manufacturer, manufacturer_part_num, value, footprint ),
        boxes ( name )
      `)
      .order("last_updated", { ascending: false });
    setRows((data as unknown as InventoryRow[]) ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      fetchInventory(supabase),
      supabase.from("parts").select("part_num, category, value, description, manufacturer").order("part_num"),
      supabase.from("boxes").select("box_id, name, description, colour").order("name"),
    ]).then(([, pts, bxs]) => {
      setAllParts(pts.data ?? []);
      setBoxes(bxs.data ?? []);
      setLoading(false);
    });
  }, []);

  // Close part dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (partDropRef.current && !partDropRef.current.contains(e.target as Node)) {
        setShowPartDrop(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered = filterQuery.trim()
    ? rows.filter((r) => {
        const tokens = filterQuery.toLowerCase().split(/\s+/).filter(Boolean);
        const fields = [
          r.parts?.part_num, r.parts?.manufacturer_part_num, r.parts?.description,
          r.parts?.manufacturer, r.parts?.category, r.parts?.value, r.boxes?.name,
        ];
        return tokens.every((tok) => fields.some((f) => f?.toLowerCase().includes(tok)));
      })
    : rows;

  const partResults = partSearch.trim()
    ? allParts
        .filter((p) =>
          [p.part_num, p.description, p.manufacturer]
            .some((f) => f?.toLowerCase().includes(partSearch.toLowerCase()))
        )
        .slice(0, 20)
    : allParts.slice(0, 20);

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openModal() {
    setPartSearch("");
    setSelectedPart(null);
    setShowPartDrop(false);
    setQuantity(0);
    setMinQty(0);
    setLocationId("");
    setModalError(null);
    setShowModal(true);
  }

  async function handleAdd() {
    if (!selectedPart) {
      setModalError("Please select a part.");
      return;
    }
    setSubmitting(true);
    setModalError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("inventory").insert({
      part_num: selectedPart.part_num,
      quantity,
      min_quantity: minQty,
      location: locationId || null,
      updated_by: user?.id ?? null,
      last_updated: new Date().toISOString(),
    });

    setSubmitting(false);

    if (error) {
      setModalError(
        error.code === "23505"
          ? "This part already exists at that location."
          : error.message
      );
      return;
    }

    await fetchInventory(supabase);
    setShowModal(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pt-24 px-6 pb-12 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#1c1c1e] mb-6">Inventory</h1>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Filter by part #, keyword, manufacturer…"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="flex-1 min-w-48 max-w-sm px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-white text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
        />
        <button
          onClick={openModal}
          className="px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] transition flex items-center gap-2 whitespace-nowrap"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Component
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-[#1c1c1e]/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#1c1c1e]/50">
          {filterQuery.trim()
            ? "No matching entries."
            : "No inventory entries yet — add a component to get started."}
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
              {filtered.map((r, i) => {
                const p = r.parts;
                const lowStock = r.quantity < r.min_quantity;
                return (
                  <tr
                    key={r.entry_id}
                    className={`border-t border-[#1c1c1e]/10 ${
                      i % 2 === 0 ? "bg-white" : "bg-[#fdf0e0]/60"
                    } hover:bg-[#ee8000]/10 transition-colors`}
                  >
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p?.part_num ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p?.category ?? "—"}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{p?.description ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p?.manufacturer ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p?.value ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p?.footprint ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${lowStock ? "text-red-500" : "text-[#1c1c1e]"}`}>
                        {r.quantity}
                      </span>
                      {lowStock && (
                        <span className="ml-1.5 text-[10px] font-medium text-red-400 bg-red-50 px-1.5 py-0.5 rounded-full">
                          low
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.min_quantity}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.boxes?.name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Component Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-[#1c1c1e] mb-5">Add Component to Inventory</h2>

            {/* Part selector */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                Part
              </label>
              <div className="relative" ref={partDropRef}>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Search part number or description…"
                  value={
                    selectedPart
                      ? `${selectedPart.part_num}${selectedPart.description ? ` — ${selectedPart.description}` : ""}`
                      : partSearch
                  }
                  onChange={(e) => {
                    setPartSearch(e.target.value);
                    setSelectedPart(null);
                    setShowPartDrop(true);
                  }}
                  onFocus={() => setShowPartDrop(true)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
                {showPartDrop && partResults.length > 0 && !selectedPart && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-[#1c1c1e]/10 shadow-xl max-h-52 overflow-y-auto">
                    {partResults.map((p) => (
                      <button
                        key={p.part_num}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedPart(p);
                          setShowPartDrop(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#ee8000]/10 transition-colors border-b border-[#1c1c1e]/5 last:border-0"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-[#1c1c1e]">{p.part_num}</span>
                          <span className="text-xs text-[#1c1c1e]/40">{p.category}</span>
                          {p.value && (
                            <span className="text-xs font-medium text-[#ee8000] bg-[#ee8000]/10 px-1.5 py-0.5 rounded-md">{p.value}</span>
                          )}
                        </div>
                        {p.description && (
                          <span className="block text-xs text-[#1c1c1e]/50 truncate mt-0.5">{p.description}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quantity + Min Qty */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                  Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                  Min Qty
                </label>
                <input
                  type="number"
                  min={0}
                  value={minQty}
                  onChange={(e) => setMinQty(Math.max(0, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
              </div>
            </div>

            {/* Location */}
            <div className="mb-6">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                Location
              </label>
              <SelectDropdown
                value={locationId}
                onChange={setLocationId}
                placeholder="No location"
                nullLabel="No location"
                options={boxes.map((b) => ({
                  value: b.box_id,
                  label: b.name,
                  description: b.description ?? undefined,
                  colour: b.colour ?? undefined,
                }))}
              />
            </div>

            {modalError && (
              <p className="text-xs text-red-500 mb-4">{modalError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={submitting || !selectedPart}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {submitting && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {submitting ? "Adding…" : "Add to Inventory"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
