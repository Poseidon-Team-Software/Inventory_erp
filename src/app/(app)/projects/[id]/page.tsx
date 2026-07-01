"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProjectStatus = "Active" | "Completed" | "Archived";

type Project = {
  proj_id: string;
  proj_name: string;
  description: string | null;
  status: ProjectStatus;
  creation: string;
  managed_by: string | null;
};

type BomRow = {
  id: string;
  quantity: number;
  designator: string | null;
  notes: string | null;
  parts: {
    part_num: string;
    description: string | null;
    value: string | null;
    footprint: string | null;
    category: string;
  } | null;
  inStock: number;
};

type PartOption = {
  part_num: string;
  description: string | null;
  value: string | null;
  footprint: string | null;
  inStock: number;
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  Active:    "bg-emerald-50 text-emerald-600 border border-emerald-100",
  Completed: "bg-blue-50 text-blue-500 border border-blue-100",
  Archived:  "bg-[#1c1c1e]/5 text-[#1c1c1e]/40 border border-[#1c1c1e]/10",
};

const STATUS_DOT: Record<ProjectStatus, string> = {
  Active:    "bg-emerald-400",
  Completed: "bg-blue-400",
  Archived:  "bg-[#1c1c1e]/25",
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_STYLES[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}

// ── Stock status: red = need to order, amber = will drop below 3, green = healthy ──

type StockLevel = "order" | "low" | "ok";

const STOCK_STYLES: Record<StockLevel, string> = {
  order: "bg-red-50 text-red-600 border border-red-100",
  low:   "bg-amber-50 text-amber-600 border border-amber-100",
  ok:    "bg-emerald-50 text-emerald-600 border border-emerald-100",
};

const STOCK_DOT: Record<StockLevel, string> = {
  order: "bg-red-500",
  low:   "bg-amber-400",
  ok:    "bg-emerald-400",
};

function stockStatus(needed: number, inStock: number): { level: StockLevel; label: string } {
  if (inStock < needed) return { level: "order", label: `${needed - inStock} short` };
  const remainder = inStock - needed;
  if (remainder < 3) return { level: "low", label: `${remainder} left` };
  return { level: "ok", label: `${remainder} left` };
}

function StockBadge({ needed, inStock }: { needed: number; inStock: number }) {
  const { level, label } = stockStatus(needed, inStock);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STOCK_STYLES[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STOCK_DOT[level]}`} />
      {label}
    </span>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [bom, setBom] = useState<BomRow[]>([]);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Add-part modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addShowDrop, setAddShowDrop] = useState(false);
  const [selectedPart, setSelectedPart] = useState<PartOption | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addDesignator, setAddDesignator] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete-project modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadBom(supabase: ReturnType<typeof createClient>) {
    const { data: bomData } = await supabase
      .from("bom")
      .select("id, quantity, designator, notes, parts(part_num, description, value, footprint, category)")
      .eq("project_id", id)
      .order("designator");

    const rows = (bomData ?? []) as unknown as Omit<BomRow, "inStock">[];
    const partNums = [...new Set(rows.map((r) => r.parts?.part_num).filter(Boolean))] as string[];

    let stockMap: Record<string, number> = {};
    if (partNums.length > 0) {
      const { data: invData } = await supabase
        .from("inventory")
        .select("part_num, quantity")
        .in("part_num", partNums);
      stockMap = (invData ?? []).reduce((acc, r) => {
        acc[r.part_num] = (acc[r.part_num] ?? 0) + r.quantity;
        return acc;
      }, {} as Record<string, number>);
    }

    setBom(rows.map((r) => ({ ...r, inStock: r.parts ? stockMap[r.parts.part_num] ?? 0 : 0 })));
  }

  async function loadPartOptions(supabase: ReturnType<typeof createClient>) {
    const [{ data: parts }, { data: inv }] = await Promise.all([
      supabase.from("parts").select("part_num, description, value, footprint").order("part_num"),
      supabase.from("inventory").select("part_num, quantity"),
    ]);

    const stockMap = (inv ?? []).reduce((acc, r) => {
      acc[r.part_num] = (acc[r.part_num] ?? 0) + r.quantity;
      return acc;
    }, {} as Record<string, number>);

    setPartOptions(
      (parts ?? []).map((p) => ({ ...p, inStock: stockMap[p.part_num] ?? 0 }))
    );
  }

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const { data: proj } = await supabase
        .from("projects")
        .select("proj_id, proj_name, description, status, creation, managed_by")
        .eq("proj_id", id)
        .single();

      if (cancelled) return;
      if (!proj) { setNotFound(true); setLoading(false); return; }
      setProject(proj);

      if (proj.managed_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name")
          .eq("user_id", proj.managed_by)
          .single();
        if (!cancelled) setOwnerName(profile?.name ?? null);
      }

      await Promise.all([loadBom(supabase), loadPartOptions(supabase)]);
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  function openAddModal() {
    setAddSearch("");
    setAddShowDrop(false);
    setSelectedPart(null);
    setAddQty(1);
    setAddDesignator("");
    setAddError(null);
    setShowAddModal(true);
  }

  async function handleAddPart() {
    if (!selectedPart) { setAddError("Please select a part."); return; }
    if (addQty < 1) { setAddError("Quantity must be at least 1."); return; }

    setAddSubmitting(true);
    setAddError(null);

    const supabase = createClient();

    const { error: bomError } = await supabase.from("bom").insert({
      project_id: id,
      part_num: selectedPart.part_num,
      quantity: addQty,
      designator: addDesignator.trim() || null,
    });

    setAddSubmitting(false);

    if (bomError) {
      setAddError(
        bomError.code === "23505"
          ? "That designator is already used in this BOM."
          : bomError.message
      );
      return;
    }

    await loadBom(supabase);
    setShowAddModal(false);
  }

  async function handleDeleteProject() {
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Return every BOM quantity to inventory before the project (and its BOM,
    // which cascades) is removed.
    const demand = bom.reduce((acc, r) => {
      if (!r.parts) return acc;
      acc[r.parts.part_num] = (acc[r.parts.part_num] ?? 0) + r.quantity;
      return acc;
    }, {} as Record<string, number>);

    for (const [partNum, qty] of Object.entries(demand)) {
      const { data: existing } = await supabase
        .from("inventory")
        .select("entry_id, quantity")
        .eq("part_num", partNum)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("inventory")
          .update({
            quantity: existing.quantity + qty,
            last_updated: new Date().toISOString(),
            updated_by: user?.id ?? null,
          })
          .eq("entry_id", existing.entry_id);
      } else {
        await supabase.from("inventory").insert({
          part_num: partNum,
          quantity: qty,
          min_quantity: 0,
          updated_by: user?.id ?? null,
          last_updated: new Date().toISOString(),
        });
      }
    }

    const { error } = await supabase.from("projects").delete().eq("proj_id", id);

    if (error) {
      setDeleting(false);
      setDeleteError(error.message);
      return;
    }

    router.push("/projects");
  }

  const addResults = addSearch.trim()
    ? partOptions.filter((o) =>
        [o.part_num, o.description, o.value].some((f) =>
          f?.toLowerCase().includes(addSearch.toLowerCase())
        )
      )
    : partOptions;

  if (loading) {
    return (
      <div className="pt-24 px-6 pb-16 max-w-screen-xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
          <div className="h-[420px] rounded-2xl bg-[#1c1c1e]/5 animate-pulse" />
          <div className="h-[420px] rounded-2xl bg-[#1c1c1e]/5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="pt-24 px-6 pb-16 max-w-screen-xl mx-auto flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-[#1c1c1e]/40">Project not found.</p>
        <Link href="/projects" className="text-sm text-[#ee8000] hover:underline">Back to projects</Link>
      </div>
    );
  }

  const date = new Date(project.creation).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className="pt-24 px-6 pb-16 max-w-screen-xl mx-auto">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-[#1c1c1e]/50 hover:text-[#ee8000] transition mb-6"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to projects
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8 items-start">
        {/* ── Left: project details ── */}
        <div className="lg:sticky lg:top-24 flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-[#1c1c1e]/10 shadow-sm overflow-hidden">
            <div className="h-52 bg-[#1c1c1e] flex items-center justify-center">
              <Image src="/logo_mark_orange.png" alt="" width={64} height={64} className="object-contain opacity-90" />
            </div>

            <div className="p-6">
              <StatusBadge status={project.status} />
              <h1 className="text-2xl font-semibold text-[#1c1c1e] mt-3 leading-tight">{project.proj_name}</h1>

              {ownerName && (
                <div className="flex items-center gap-2.5 mt-4">
                  <div className="w-8 h-8 rounded-full bg-[#ee8000]/10 border border-[#ee8000]/30 flex items-center justify-center text-xs font-semibold text-[#ee8000] shrink-0">
                    {ownerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-[#1c1c1e] font-medium truncate">{ownerName}</p>
                    <p className="text-[10px] uppercase tracking-widest text-[#1c1c1e]/35">Owner</p>
                  </div>
                </div>
              )}

              <p className="text-sm text-[#1c1c1e]/60 leading-relaxed mt-5 whitespace-pre-line">
                {project.description || "No description provided."}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-[#1c1c1e]/6 flex items-center gap-4 text-xs text-[#1c1c1e]/40">
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {date}
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                {bom.length} part{bom.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              disabled
              title="Coming soon"
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl border border-[#1c1c1e]/10 text-[#1c1c1e]/30 cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
              </svg>
              <span className="text-[11px] font-medium">Print BOM</span>
            </button>
            <button
              disabled
              title="Coming soon"
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl border border-[#1c1c1e]/10 text-[#1c1c1e]/30 cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="text-[11px] font-medium">Edit</span>
            </button>
            <button
              onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span className="text-[11px] font-medium">Delete</span>
            </button>
          </div>
        </div>

        {/* ── Right: BOM table ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1c1c1e]">Bill of Materials</h2>
            <button
              onClick={openAddModal}
              className="px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] transition flex items-center gap-2 whitespace-nowrap"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Part
            </button>
          </div>

          {bom.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 rounded-2xl border border-dashed border-[#1c1c1e]/15">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-15">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p className="text-sm text-[#1c1c1e]/40">No parts added to this BOM yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#1c1c1e]/10 shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#1c1c1e] text-white">
                  <tr>
                    {["Description", "Value", "Footprint", "Needed", "Stock"].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bom.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-t border-[#1c1c1e]/10 ${i % 2 === 0 ? "bg-white" : "bg-[#fdf0e0]/60"} hover:bg-[#ee8000]/10 transition-colors`}
                    >
                      <td className="px-4 py-3 max-w-xs truncate">{r.parts?.description ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.parts?.value ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.parts?.footprint ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-[#1c1c1e]">{r.quantity}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StockBadge needed={r.quantity} inStock={r.inStock} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Part Modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-[#1c1c1e] mb-1">Add Part to BOM</h2>
            <p className="text-xs text-[#1c1c1e]/40 mb-5">Sets how many this project needs — inventory isn&apos;t touched.</p>

            {/* Part selector */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                Part
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Search part number or description…"
                  value={
                    selectedPart
                      ? `${selectedPart.part_num}${selectedPart.description ? ` — ${selectedPart.description}` : ""}`
                      : addSearch
                  }
                  onChange={(e) => {
                    setAddSearch(e.target.value);
                    setSelectedPart(null);
                    setAddShowDrop(true);
                  }}
                  onFocus={() => setAddShowDrop(true)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
                {addShowDrop && !selectedPart && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-[#1c1c1e]/10 shadow-xl max-h-52 overflow-y-auto">
                    {addResults.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-[#1c1c1e]/40">No parts match your search.</p>
                    ) : (
                      addResults.map((o) => (
                        <button
                          key={o.part_num}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedPart(o);
                            setAddQty(1);
                            setAddShowDrop(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#ee8000]/10 transition-colors border-b border-[#1c1c1e]/5 last:border-0"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-[#1c1c1e]">{o.part_num}</span>
                            {o.value && (
                              <span className="text-xs font-medium text-[#ee8000] bg-[#ee8000]/10 px-1.5 py-0.5 rounded-md">{o.value}</span>
                            )}
                            <span className="ml-auto text-xs text-[#1c1c1e]/40 whitespace-nowrap">{o.inStock} in stock</span>
                          </div>
                          {o.description && (
                            <span className="block text-xs text-[#1c1c1e]/50 truncate mt-0.5">{o.description}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quantity + Designator */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                  Quantity Needed
                </label>
                <input
                  type="number"
                  min={1}
                  value={addQty}
                  onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                  Designator
                </label>
                <input
                  type="text"
                  placeholder="e.g. R1"
                  value={addDesignator}
                  onChange={(e) => setAddDesignator(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
              </div>
            </div>

            {addError && <p className="text-xs text-red-500 mb-4">{addError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPart}
                disabled={addSubmitting || !selectedPart}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {addSubmitting && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {addSubmitting ? "Adding…" : "Add to BOM"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Project Modal ── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setShowDeleteModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#1c1c1e]">Delete &ldquo;{project.proj_name}&rdquo;?</h2>
            </div>

            <p className="text-sm text-[#1c1c1e]/60 leading-relaxed mb-6">
              This permanently deletes the project and its BOM. All {bom.length} part{bom.length !== 1 ? "s" : ""} in the BOM will be returned to inventory. This can&apos;t be undone.
            </p>

            {deleteError && <p className="text-xs text-red-500 mb-4">{deleteError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 disabled:opacity-40 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {deleting && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {deleting ? "Deleting…" : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
