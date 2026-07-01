"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SelectDropdown from "@/components/SelectDropdown";

type SubteamEnum = "Electrical" | "Mechanical" | "Dynamics";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subteam, setSubteam] = useState<SubteamEnum>("Electrical");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }
      setEmail(user.email ?? "");

      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("name, subteam")
        .eq("user_id", user.id)
        .single();

      if (!fetchError && profile) {
        setName(profile.name ?? "");
        setSubteam(profile.subteam as SubteamEnum);
      }
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to edit your profile.");
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ name: trimmed, subteam })
      .eq("user_id", user.id);

    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
  }

  if (loading) {
    return (
      <div className="pt-24 px-6 pb-16 max-w-screen-sm mx-auto">
        <div className="h-64 rounded-2xl bg-[#1c1c1e]/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="pt-24 px-6 pb-16 max-w-screen-sm mx-auto">
      <h1 className="text-2xl font-semibold text-[#1c1c1e] mb-8">Edit Profile</h1>

      <div className="bg-white rounded-2xl border border-[#1c1c1e]/10 shadow-sm p-6">
        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">Email</label>
          <input
            type="text"
            value={email}
            disabled
            className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-[#1c1c1e]/5 text-sm text-[#1c1c1e]/50 cursor-not-allowed"
          />
        </div>

        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">Name</label>
          <input
            type="text"
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-white text-sm text-[#1c1c1e] placeholder:text-[#1c1c1e]/35 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
          />
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-semibold text-[#1c1c1e]/50 mb-1.5 uppercase tracking-widest">Subteam</label>
          <SelectDropdown
            value={subteam}
            onChange={(v) => { setSubteam(v as SubteamEnum); setSaved(false); }}
            nullable={false}
            options={[
              { value: "Electrical", label: "Electrical" },
              { value: "Mechanical", label: "Mechanical" },
              { value: "Dynamics", label: "Dynamics" },
            ]}
          />
        </div>

        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
        {saved && !error && <p className="text-xs text-emerald-600 mb-4">Profile saved.</p>}

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 text-sm text-[#1c1c1e]/70 hover:bg-[#1c1c1e]/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting || !name.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#ee8000] text-white text-sm font-medium hover:bg-[#d97000] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {submitting && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {submitting ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
