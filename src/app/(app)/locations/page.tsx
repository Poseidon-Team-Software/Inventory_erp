"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Box = {
  box_id: string;
  name: string;
  description: string | null;
  colour: string | null;
  label: string | null;
  created_at: string;
};

const COLS = ["Colour", "Name", "Label", "Description", "Added", ""] as const;

export default function LocationsPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colour, setColour] = useState("#ee8000");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Box | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function fetchBoxes(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase
      .from("boxes")
      .select("box_id, name, description, colour, label, created_at")
      .order("created_at", { ascending: false });
    setBoxes(data ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    fetchBoxes(supabase).then(() => setLoading(false));
  }, []);

  const filtered = filterQuery.trim()
    ? boxes.filter((b) =>
        [b.name, b.label, b.description]
          .some((f) => f?.toLowerCase().includes(filterQuery.toLowerCase()))
      )
    : boxes;

  function openModal() {
    setName("");
    setDescription("");
    setColour("#ee8000");
    setLabel("");
    setModalError(null);
    setShowModal(true);
  }

  async function handleAdd() {
    if (!name.trim()) {
      setModalError("Name is required.");
      return;
    }
    setSubmitting(true);
    setModalError(null);

    const supabase = createClient();
    const { error } = await supabase.from("boxes").insert({
      name: name.trim(),
      description: description.trim() || null,
      colour: colour || null,
      label: label.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      setModalError(error.message);
      return;
    }

    await fetchBoxes(supabase);
    setShowModal(false);
  }

  function openDeleteModal(box: Box) {
    setDeleteTarget(box);
    setDeleteError(null);
    setDeleting(false);
  }

  async function handleDeleteBox() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();

    const { count } = await supabase
      .from("inventory")
      .select("entry_id", { count: "exact", head: true })
      .eq("location", deleteTarget.box_id);

    if (count && count > 0) {
      setDeleting(false);
      setDeleteError("This location isn't empty and can't be deleted.");
      return;
    }

    const { error } = await supabase.from("boxes").delete().eq("box_id", deleteTarget.box_id);

    setDeleting(false);

    if (error) {
      setDeleteError(error.message);
      return;
    }

    await fetchBoxes(supabase);
    setDeleteTarget(null);
  }

  return (
    <div className="pt-24 px-6 pb-12 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#1c1c1e] mb-6">Locations</h1>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Filter by name, label, description…"
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
          Add Location
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-[#1c1c1e]/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#1c1c1e]/50">
          {filterQuery.trim()
            ? "No matching locations."
            : "No locations yet — add one to start organising your inventory."}
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
              {filtered.map((b, i) => (
                <tr
                  key={b.box_id}
                  className={`border-t border-[#1c1c1e]/10 ${
                    i % 2 === 0 ? "bg-white" : "bg-[#fdf0e0]/60"
                  } hover:bg-[#ee8000]/10 transition-colors`}
                >
                  <td className="px-4 py-3">
                    {b.colour ? (
                      <span
                        className="inline-block w-5 h-5 rounded-full border border-black/10 shadow-sm"
                        style={{ backgroundColor: b.colour }}
                      />
                    ) : (
                      <span className="inline-block w-5 h-5 rounded-full bg-[#1c1c1e]/10" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{b.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{b.label ?? "—"}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{b.description ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#1c1c1e]/50">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        disabled
                        title="Coming soon"
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#1c1c1e]/20 cursor-not-allowed"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openDeleteModal(b)}
                        title="Delete location"
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#1c1c1e]/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Location Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-[#1c1c1e] mb-5">Add Location</h2>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Box A3, Shelf 2, Drawer 7…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
              />
            </div>

            {/* Label + Colour */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                  Rack / Shelf Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. R1-S2"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                  Colour
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1c1c1e]/15 bg-white h-[42px]">
                  <input
                    type="color"
                    value={colour}
                    onChange={(e) => setColour(e.target.value)}
                    className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-xs text-[#1c1c1e]/60">{colour}</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">
                Description
              </label>
              <textarea
                placeholder="Optional notes about this location…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition resize-none"
              />
            </div>

            {modalError && (
              <p className="text-xs text-red-500 mb-4">{modalError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={submitting || !name.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {submitting && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {submitting ? "Adding…" : "Add Location"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Location Modal ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#1c1c1e]">Delete &ldquo;{deleteTarget.name}&rdquo;?</h2>
            </div>

            <p className="text-sm text-[#1c1c1e]/60 leading-relaxed mb-6">
              This can&apos;t be undone. If this location still has inventory in it, deletion will be blocked.
            </p>

            {deleteError && <p className="text-xs text-red-500 mb-4">{deleteError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 disabled:opacity-40 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBox}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {deleting && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {deleting ? "Deleting…" : "Delete Location"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
