"use client";

import { use, useEffect, useRef, useState } from "react";
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
  critical_since: string | null;
  parts: {
    part_num: string;
    manufacturer_part_num: string | null;
    description: string | null;
    value: string | null;
    footprint: string | null;
    category: string;
  } | null;
  inStock: number;
};

type PartOption = {
  part_num: string;
  manufacturer_part_num: string | null;
  description: string | null;
  value: string | null;
  footprint: string | null;
  inStock: number;
};

type ImportRow =
  | { status: "ok"; identifier: string; part: PartOption; quantity: number; designator: string | null }
  | { status: "error"; identifier: string; reason: string };

type ImportSummary = {
  imported: number;
  errors: { identifier: string; reason: string }[];
  fatalError?: string;
};

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

  // Solder PCB modal — commits the BOM's parts against real inventory
  const [showSolderModal, setShowSolderModal] = useState(false);
  const [soldering, setSoldering] = useState(false);
  const [solderError, setSolderError] = useState<string | null>(null);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  async function loadBom(supabase: ReturnType<typeof createClient>) {
    const { data: bomData } = await supabase
      .from("bom")
      .select("id, quantity, designator, notes, critical_since, parts(part_num, manufacturer_part_num, description, value, footprint, category)")
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
      supabase.from("parts").select("part_num, manufacturer_part_num, description, value, footprint").order("part_num"),
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

  // Inserts one part into this project's BOM. Shared by the "Add Part" modal
  // and the CSV import loop, so both go through the exact same write.
  async function addPartToBom(
    supabase: ReturnType<typeof createClient>,
    part: PartOption,
    quantity: number,
    designator: string | null
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const { error } = await supabase.from("bom").insert({
      project_id: id,
      part_num: part.part_num,
      quantity,
      designator: designator?.trim() || null,
    });

    if (error) {
      return {
        ok: false,
        error: error.code === "23505" ? "That designator is already used in this BOM." : error.message,
      };
    }
    return { ok: true };
  }

  async function handleAddPart() {
    if (!selectedPart) { setAddError("Please select a part."); return; }
    if (addQty < 1) { setAddError("Quantity must be at least 1."); return; }

    setAddSubmitting(true);
    setAddError(null);

    const supabase = createClient();
    const result = await addPartToBom(supabase, selectedPart, addQty, addDesignator);

    setAddSubmitting(false);

    if (!result.ok) {
      setAddError(result.error);
      return;
    }

    await loadBom(supabase);
    setShowAddModal(false);
  }

  // Total quantity needed per part_num across the current BOM.
  function bomDemandByPart(): Record<string, number> {
    return bom.reduce((acc, r) => {
      if (!r.parts) return acc;
      acc[r.parts.part_num] = (acc[r.parts.part_num] ?? 0) + r.quantity;
      return acc;
    }, {} as Record<string, number>);
  }

  // Applies `sign * qty` to each part's inventory (aggregated across any
  // per-location rows into the first one found). Shared by "Solder PCB"
  // (consumes stock, sign -1) and project deletion (returns it, sign +1).
  async function applyInventoryDelta(
    supabase: ReturnType<typeof createClient>,
    demand: Record<string, number>,
    sign: 1 | -1,
    userId: string | null
  ) {
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
            quantity: existing.quantity + sign * qty,
            last_updated: new Date().toISOString(),
            updated_by: userId,
          })
          .eq("entry_id", existing.entry_id);
      } else {
        await supabase.from("inventory").insert({
          part_num: partNum,
          quantity: sign * qty,
          min_quantity: 0,
          updated_by: userId,
          last_updated: new Date().toISOString(),
        });
      }
    }
  }

  // For each BOM row, how much of its needed quantity is actually covered by
  // current stock. Stock is pooled per part_num across rows in BOM order, so
  // two rows needing the same part correctly split one shared pool.
  function computeSolderPlan(): { row: BomRow; fulfilled: number; remaining: number }[] {
    const remainingStock: Record<string, number> = {};
    return bom.map((r) => {
      if (!r.parts) return { row: r, fulfilled: 0, remaining: r.quantity };
      const partNum = r.parts.part_num;
      if (!(partNum in remainingStock)) remainingStock[partNum] = r.inStock;
      const available = Math.max(remainingStock[partNum], 0);
      const fulfilled = Math.min(r.quantity, available);
      remainingStock[partNum] = available - fulfilled;
      return { row: r, fulfilled, remaining: r.quantity - fulfilled };
    });
  }

  async function handleSolderPcb() {
    setSoldering(true);
    setSolderError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    try {
      for (const { row, fulfilled, remaining } of computeSolderPlan()) {
        if (!row.parts) continue;

        if (fulfilled > 0) {
          await applyInventoryDelta(supabase, { [row.parts.part_num]: fulfilled }, -1, user?.id ?? null);
        }

        if (remaining > 0) {
          // Short on stock — deduct what's available, leave the rest of
          // this row open (unstamped) so it keeps counting as demand, and
          // flag it critical. Keep the original critical_since if this row
          // was already blocked from an earlier solder attempt.
          await supabase
            .from("bom")
            .update({ quantity: remaining, used_at: null, critical_since: row.critical_since ?? new Date().toISOString() })
            .eq("id", row.id);
        } else {
          await supabase.from("bom").update({ used_at: new Date().toISOString(), critical_since: null }).eq("id", row.id);
        }
      }
      await Promise.all([loadBom(supabase), loadPartOptions(supabase)]);
      setShowSolderModal(false);
    } catch (err) {
      setSolderError(err instanceof Error ? err.message : "Failed to update inventory.");
    } finally {
      setSoldering(false);
    }
  }

  async function handleDeleteProject() {
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Return every BOM quantity to inventory before the project (and its BOM,
    // which cascades) is removed.
    await applyInventoryDelta(supabase, bomDemandByPart(), 1, user?.id ?? null);

    const { error } = await supabase.from("projects").delete().eq("proj_id", id);

    if (error) {
      setDeleting(false);
      setDeleteError(error.message);
      return;
    }

    router.push("/projects");
  }

  function handleExportCsv() {
    const headers = ["part_num", "manufacturer_part_num", "description", "value", "footprint", "category", "quantity", "designator", "notes", "in_stock"];
    const lines = [headers.join(",")];
    for (const r of bom) {
      lines.push(
        [
          r.parts?.part_num ?? "",
          r.parts?.manufacturer_part_num ?? "",
          r.parts?.description ?? "",
          r.parts?.value ?? "",
          r.parts?.footprint ?? "",
          r.parts?.category ?? "",
          r.quantity,
          r.designator ?? "",
          r.notes ?? "",
          r.inStock,
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project?.proj_name ?? "bom").replace(/[^a-z0-9-_]+/gi, "_")}-bom.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImportSummary(null);

    try {
      const text = await file.text();
      const Papa = (await import("papaparse")).default;
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

      if (parsed.errors.length > 0) {
        setImportParseError(parsed.errors[0].message);
        setImportRows([]);
        setShowImportModal(true);
        return;
      }
      setImportParseError(null);

      // Match each row against parts already in the catalog — same set the
      // "Add Part" dropdown offers. No Mouser fallback here.
      const byPartNum = new Map(partOptions.map((p) => [p.part_num, p]));
      const byMpn = new Map(
        partOptions
          .filter((p) => p.manufacturer_part_num)
          .map((p) => [p.manufacturer_part_num!.toLowerCase(), p])
      );

      setImportRows(
        parsed.data.map((row): ImportRow => {
          const partNum = row.part_num?.trim() || "";
          const mpn = row.manufacturer_part_num?.trim() || "";
          const identifier = partNum || mpn || "(missing)";
          const quantity = Number(row.quantity) || 0;
          const designator = row.designator?.trim() || null;

          const part = (partNum && byPartNum.get(partNum)) || (mpn && byMpn.get(mpn.toLowerCase())) || null;

          if (!part) return { status: "error", identifier, reason: "not found in parts catalog" };
          if (quantity < 1) return { status: "error", identifier, reason: "quantity must be at least 1" };

          return { status: "ok", identifier, part, quantity, designator };
        })
      );
      setShowImportModal(true);
    } catch (err) {
      setImportParseError(err instanceof Error ? err.message : "Couldn't read that file.");
      setImportRows([]);
      setShowImportModal(true);
    }
  }

  async function handleConfirmImport() {
    setImporting(true);
    const supabase = createClient();

    try {
      // Replace the existing BOM, then add every valid CSV row exactly the
      // way "Add Part" does — one call to addPartToBom per row.
      const { error: deleteError } = await supabase.from("bom").delete().eq("project_id", id);
      if (deleteError) {
        setImportSummary({ imported: 0, errors: [], fatalError: `Couldn't clear the existing BOM: ${deleteError.message}` });
        return;
      }

      const errors: { identifier: string; reason: string }[] = importRows
        .filter((r) => r.status === "error")
        .map((r) => ({ identifier: r.identifier, reason: r.reason }));

      let imported = 0;
      for (const row of importRows) {
        if (row.status !== "ok") continue;
        const result = await addPartToBom(supabase, row.part, row.quantity, row.designator);
        if (result.ok) {
          imported++;
        } else {
          errors.push({ identifier: row.identifier, reason: result.error });
        }
      }

      setImportSummary({ imported, errors });
      await Promise.all([loadBom(supabase), loadPartOptions(supabase)]);
    } catch (err) {
      setImportSummary({ imported: 0, errors: [], fatalError: err instanceof Error ? err.message : "Import failed unexpectedly." });
    } finally {
      setImporting(false);
    }
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportRows([]);
    setImportParseError(null);
    setImportSummary(null);
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
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportCsv}
              disabled={bom.length === 0}
              title={bom.length === 0 ? "No parts to export" : "Export BOM as CSV"}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl border border-[#1c1c1e]/10 text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="text-[11px] font-medium">Export CSV</span>
            </button>
            <button
              onClick={() => { setSolderError(null); setShowSolderModal(true); }}
              disabled={bom.length === 0}
              title={bom.length === 0 ? "No parts in BOM" : "Deduct these parts from inventory"}
              className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl border border-[#ee8000]/30 text-[#ee8000] hover:bg-[#ee8000]/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 21h6" /><path d="M9 3h6l3 7-3 2H9l-3-2z" /><path d="M12 12v9" /><path d="M6 21c0-2 2-3 2-3" /><path d="M18 21c0-2-2-3-2-3" />
              </svg>
              <span className="text-[11px] font-medium">Solder PCB</span>
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
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-[#1c1c1e]/70 text-sm font-medium hover:bg-[#1c1c1e]/5 transition flex items-center gap-2 whitespace-nowrap"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import CSV
              </button>
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

      {/* ── Solder PCB Modal ── */}
      {showSolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !soldering) setShowSolderModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[#1c1c1e] mb-1">Solder PCB</h2>
            <p className="text-xs text-[#1c1c1e]/40 mb-5">
              Confirm these are the actual components you used — each part below will be deducted from inventory.
            </p>

            <div className="rounded-xl border border-[#1c1c1e]/10 divide-y divide-[#1c1c1e]/8 mb-5">
              {bom.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-[#1c1c1e]/80 truncate pr-3">{r.parts?.description ?? r.parts?.part_num ?? "—"}</span>
                  <span className="font-semibold text-[#1c1c1e] shrink-0">{r.quantity}</span>
                </div>
              ))}
            </div>

            {(() => {
              const shortPlan = computeSolderPlan().filter((p) => p.remaining > 0);
              if (shortPlan.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs px-4 py-3 mb-5 leading-relaxed">
                  <p className="font-medium mb-1">
                    Not enough stock for {shortPlan.length} part{shortPlan.length !== 1 ? "s" : ""}:
                  </p>
                  {shortPlan.map((p) => (
                    <p key={p.row.id}>
                      {p.row.parts?.description ?? p.row.parts?.part_num} — short {p.remaining}
                    </p>
                  ))}
                  <p className="mt-1.5">
                    Proceeding will deduct what&apos;s available and leave the shortfall as open demand on this
                    project&apos;s BOM (still counted in Needs Ordering).
                  </p>
                </div>
              );
            })()}

            {solderError && <p className="text-xs text-red-500 mb-4">{solderError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowSolderModal(false)}
                disabled={soldering}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 disabled:opacity-40 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSolderPcb}
                disabled={soldering}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {soldering && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {soldering ? "Updating…" : "Yes, deduct from inventory"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import CSV Modal ── */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !importing) closeImportModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[#1c1c1e] mb-1">Import BOM from CSV</h2>

            {importParseError ? (
              <>
                <p className="text-sm text-red-500 leading-relaxed my-4">Couldn&apos;t parse that file: {importParseError}</p>
                <button
                  onClick={closeImportModal}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 transition"
                >
                  Close
                </button>
              </>
            ) : !importSummary ? (
              <>
                <p className="text-xs text-[#1c1c1e]/40 mb-5">
                  Each row is matched to our parts catalog by part number or manufacturer part number, then added to the BOM
                  the same way the &ldquo;Add Part&rdquo; button does.
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm px-4 py-3 mb-5 leading-relaxed">
                  This <strong>replaces</strong> the current BOM. {bom.length} existing part{bom.length !== 1 ? "s" : ""} will be removed and
                  replaced with {importRows.filter((r) => r.status === "ok").length} of {importRows.length} row{importRows.length !== 1 ? "s" : ""} from this file.
                </div>

                {importRows.some((r) => r.status === "error") && (
                  <div className="rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs px-4 py-3 mb-5">
                    <p className="font-medium mb-1">
                      {importRows.filter((r) => r.status === "error").length} row{importRows.filter((r) => r.status === "error").length !== 1 ? "s" : ""} will be skipped:
                    </p>
                    {importRows
                      .filter((r): r is Extract<ImportRow, { status: "error" }> => r.status === "error")
                      .map((r, i) => (
                        <p key={i}>{r.identifier} — {r.reason}</p>
                      ))}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={closeImportModal}
                    disabled={importing}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 disabled:opacity-40 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing || importRows.filter((r) => r.status === "ok").length === 0}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {importing && (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    )}
                    {importing ? "Importing…" : "Replace BOM"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 my-4">
                  {importSummary.fatalError ? (
                    <p className="text-sm text-red-500 leading-relaxed">{importSummary.fatalError}</p>
                  ) : (
                    <>
                      <p className="text-sm text-[#1c1c1e]/70">
                        Imported <strong>{importSummary.imported}</strong> part{importSummary.imported !== 1 ? "s" : ""} into the BOM.
                      </p>

                      {importSummary.errors.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs px-4 py-3">
                          <p className="font-medium mb-1">
                            {importSummary.errors.length} row{importSummary.errors.length !== 1 ? "s" : ""} skipped:
                          </p>
                          {importSummary.errors.map((err, i) => (
                            <p key={i}>{err.identifier} — {err.reason}</p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={closeImportModal}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] transition"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
