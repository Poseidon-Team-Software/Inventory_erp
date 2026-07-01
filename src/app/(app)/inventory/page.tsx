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

type OrderNeed = {
  part_num: string;
  description: string | null;
  value: string | null;
  footprint: string | null;
  quantity: number;
  minQuantity: number;
  demand: number;
  orderQty: number;
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
  const [bomDemand, setBomDemand] = useState<Record<string, number>>({});
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
      supabase.from("bom").select("part_num, quantity"),
    ]).then(([, pts, bxs, bom]) => {
      setAllParts(pts.data ?? []);
      setBoxes(bxs.data ?? []);
      setBomDemand(
        (bom.data ?? []).reduce((acc, r) => {
          acc[r.part_num] = (acc[r.part_num] ?? 0) + r.quantity;
          return acc;
        }, {} as Record<string, number>)
      );
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

  // Combine per-part stock (aggregated across boxes) with BOM demand from every
  // project — a part can need ordering either because it's below its min-quantity
  // buffer or because projects need more of it than is currently in stock.
  const needMap = new Map<string, OrderNeed>();

  for (const r of rows) {
    if (!r.parts) continue;
    const existing = needMap.get(r.parts.part_num);
    if (existing) {
      existing.quantity += r.quantity;
      existing.minQuantity = Math.max(existing.minQuantity, r.min_quantity);
    } else {
      needMap.set(r.parts.part_num, {
        part_num: r.parts.part_num,
        description: r.parts.description,
        value: r.parts.value,
        footprint: r.parts.footprint,
        quantity: r.quantity,
        minQuantity: r.min_quantity,
        demand: 0,
        orderQty: 0,
      });
    }
  }

  for (const [partNum, demand] of Object.entries(bomDemand)) {
    if (!needMap.has(partNum)) {
      const p = allParts.find((ap) => ap.part_num === partNum);
      needMap.set(partNum, {
        part_num: partNum,
        description: p?.description ?? null,
        value: p?.value ?? null,
        footprint: null,
        quantity: 0,
        minQuantity: 0,
        demand: 0,
        orderQty: 0,
      });
    }
    needMap.get(partNum)!.demand = demand;
  }

  const toOrder = [...needMap.values()]
    .map((n) => ({ ...n, orderQty: Math.max(n.minQuantity - n.quantity, n.demand - n.quantity, 0) }))
    .filter((n) => n.orderQty > 0)
    .sort((a, b) => b.orderQty - a.orderQty);

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

      {/* Needs Ordering */}
      {!loading && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-[#1c1c1e]">Needs Ordering</h2>
            {toOrder.length > 0 && (
              <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{toOrder.length}</span>
            )}
          </div>

          {toOrder.length === 0 ? (
            <p className="text-sm text-[#1c1c1e]/50">Everything is stocked above its minimum.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#1c1c1e]/10 shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#1c1c1e] text-white">
                  <tr>
                    {["Part #", "Description", "Value", "Footprint", "In Stock", "Needed", "Order Qty"].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {toOrder.map((r, i) => (
                    <tr
                      key={r.part_num}
                      className={`border-t border-[#1c1c1e]/10 ${
                        i % 2 === 0 ? "bg-white" : "bg-[#fdf0e0]/60"
                      } hover:bg-[#ee8000]/10 transition-colors`}
                    >
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.part_num}</td>
                      <td className="px-4 py-3 max-w-xs truncate">{r.description ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.value ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.footprint ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.quantity}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{Math.max(r.minQuantity, r.demand)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {r.orderQty}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
