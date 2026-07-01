"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SelectDropdown from "@/components/SelectDropdown";

type ProjectStatus = "Active" | "Completed" | "Archived";

type Project = {
  proj_id: string;
  proj_name: string;
  description: string | null;
  status: ProjectStatus;
  creation: string;
  created_at: string;
  managed_by: string | null;
  profiles: { name: string } | null;
  bom: { id: string }[];
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("Active");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  async function fetchProjects(supabase: ReturnType<typeof createClient>) {
    const { data: projectsData, error } = await supabase
      .from("projects")
      .select("proj_id, proj_name, description, status, creation, created_at, managed_by, bom(id)")
      .order("created_at", { ascending: false });

    if (error || !projectsData) { setProjects([]); return; }

    // profiles.user_id → auth.users ← projects.managed_by: no direct FK, fetch separately
    const userIds = [...new Set(projectsData.map((p) => p.managed_by).filter(Boolean))] as string[];
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", userIds);
      nameMap = Object.fromEntries((profilesData ?? []).map((p) => [p.user_id, p.name]));
    }

    setProjects(
      projectsData.map((p) => ({
        ...p,
        profiles: p.managed_by && nameMap[p.managed_by] ? { name: nameMap[p.managed_by] } : null,
      })) as unknown as Project[]
    );
  }

  useEffect(() => {
    const supabase = createClient();
    fetchProjects(supabase).then(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? projects.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.proj_name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.profiles?.name.toLowerCase().includes(q)
        );
      })
    : projects;

  function openModal() {
    setName("");
    setDesc("");
    setStatus("Active");
    setModalError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setModalError("Project name is required."); return; }
    setSubmitting(true);
    setModalError(null);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setModalError("You must be logged in to create a project.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("projects").insert({
      proj_name: trimmed,
      description: desc.trim() || null,
      status,
      managed_by: session.user.id,
    });

    setSubmitting(false);
    if (error) { setModalError(error.message); return; }

    await fetchProjects(supabase);
    setShowModal(false);
  }

  return (
    <div className="pt-24 px-6 pb-16 max-w-screen-xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#1c1c1e]">Projects</h1>
          {!loading && (
            <p className="text-sm text-[#1c1c1e]/40 mt-0.5">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="flex gap-3 ml-auto">
          <input
            type="text"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-white text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition w-56"
          />
          <button
            onClick={openModal}
            className="px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] transition flex items-center gap-2 whitespace-nowrap"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-[#1c1c1e]/5 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-15">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <p className="text-sm text-[#1c1c1e]/40">
            {query.trim() ? "No projects match your search." : "No projects yet — create one to get started."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.proj_id} project={p} />
          ))}
        </div>
      )}

      {/* ── New Project Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-[#1c1c1e] mb-5">New Project</h2>

            <div className="mb-4">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">Project Name</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. BSPD, Accumulator BMS…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
              />
            </div>

            <div className="mb-4">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">Status</label>
              <SelectDropdown
                value={status}
                onChange={(v) => setStatus(v as ProjectStatus)}
                nullable={false}
                options={[
                  { value: "Active",    label: "Active" },
                  { value: "Completed", label: "Completed" },
                  { value: "Archived",  label: "Archived" },
                ]}
              />
            </div>

            <div className="mb-6">
              <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">Description</label>
              <textarea
                rows={3}
                placeholder="What is this project about?"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition resize-none"
              />
            </div>

            {modalError && <p className="text-xs text-red-500 mb-4">{modalError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !name.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {submitting && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {submitting ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project: p }: { project: Project }) {
  const bomCount = p.bom?.length ?? 0;
  const date = new Date(p.creation).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <Link
      href={`/projects/${p.proj_id}`}
      className="group relative bg-white rounded-2xl border border-[#1c1c1e]/10 shadow-sm hover:border-[#ee8000]/50 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col"
    >
      {/* Body */}
      <div className="flex flex-1 gap-4 p-5">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <StatusBadge status={p.status} />
          <h3 className="font-semibold text-[#1c1c1e] text-lg leading-tight mt-2 truncate">{p.proj_name}</h3>
          {p.profiles?.name && (
            <p className="text-xs text-[#1c1c1e]/40">owner: {p.profiles.name}</p>
          )}
          {p.description && (
            <p className="text-sm text-[#1c1c1e]/60 leading-relaxed mt-2 line-clamp-3">{p.description}</p>
          )}
        </div>

        {/* Logo thumbnail */}
        <div className="shrink-0 w-[90px] h-[90px] rounded-2xl bg-[#1c1c1e] flex items-center justify-center group-hover:bg-[#2a2a2c] transition-colors duration-200 self-start">
          <Image
            src="/logo_mark_orange.png"
            alt=""
            width={46}
            height={46}
            className="object-contain"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#1c1c1e]/6 flex items-center gap-3 text-[11px] text-[#1c1c1e]/35">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>{bomCount} part{bomCount !== 1 ? "s" : ""} in BOM</span>
        <span className="ml-auto">{date}</span>
      </div>
    </Link>
  );
}
