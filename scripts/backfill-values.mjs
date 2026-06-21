/**
 * Backfill script — extracts value + footprint from descriptions/attributes
 * and writes them to parts where those fields are null.
 *
 * Usage: node scripts/backfill-values.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq === -1 || line.trimStart().startsWith("#")) continue;
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── Value ─────────────────────────────────────────────────────────────────────

function extractValue(desc, category) {
  if (!desc) return null;
  if (category === "Resistor" || category === "Thermistor") {
    const m1 = desc.match(/\b(\d+(?:\.\d+)?)\s*(k|K|M|G)?\s*[Oo]hms?\b/);
    if (m1) return `${m1[1]}${{ k: "kΩ", K: "kΩ", M: "MΩ", G: "GΩ" }[m1[2]] ?? "Ω"}`;
    const m2 = desc.match(/\b(\d+(?:\.\d+)?)\s*(k|K|M|G)\b/);
    if (m2) return `${m2[1]}${{ k: "kΩ", K: "kΩ", M: "MΩ", G: "GΩ" }[m2[2]]}`;
  }
  if (category === "Capacitor") {
    const m = desc.match(/\.?(\d+(?:\.\d+)?)\s*(p|n|u|µ|μ|m)\s*F\b/i);
    if (m) return `${m[1]}${m[2].toLowerCase().replace(/[µμ]/g, "u")}F`;
  }
  if (category === "Inductor") {
    const m = desc.match(/\b(\d+(?:\.\d+)?)\s*(m|u|µ|n)?\s*H\b/i);
    if (m) return `${m[1]}${(m[2] ?? "").toLowerCase().replace(/[µμ]/g, "u")}H`;
  }
  return null;
}

// ── Footprint ─────────────────────────────────────────────────────────────────

function extractFootprint(desc, attrs) {
  const attrNames = ["Case Style", "Package / Case", "Package Style", "Case/Package"];
  for (const name of attrNames) {
    const hit = (attrs ?? []).find((a) => a.AttributeName === name);
    if (hit?.AttributeValue) return hit.AttributeValue;
  }
  if (!desc) return null;
  const sot = desc.match(/\bSOT[-]?(\d+)(?:-(\d+))?\b/i);
  if (sot) return `SOT-${sot[1]}${sot[2] ? `-${sot[2]}` : ""}`;
  const smd = desc.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/);
  if (smd) return smd[1];
  const pkg = desc.match(/\b(DIP|SOIC|TSSOP|TQFP|TSOP|MSOP|SSOP|WLCSP|SC-70|SC70|PDIP|SPDIP)[-\s]?(\d+)?\b/i);
  if (pkg) return pkg[2] ? `${pkg[1].toUpperCase()}-${pkg[2]}` : pkg[1].toUpperCase();
  const to = desc.match(/\bTO[-](\d+)\b/i);
  if (to) return `TO-${to[1]}`;
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { data: parts, error } = await supabase
    .from("parts")
    .select("part_num, category, description, value, footprint, mouser_details");

  if (error) throw new Error(error.message);
  console.log(`Loaded ${parts.length} parts\n`);

  const updates = [];

  for (const p of parts) {
    const attrs = p.mouser_details?.ProductAttributes ?? [];
    const newValue    = p.value    ?? extractValue(p.description, p.category);
    const newFootprint = p.footprint ?? extractFootprint(p.description, attrs);

    if (newValue !== p.value || newFootprint !== p.footprint) {
      updates.push({ part_num: p.part_num, value: newValue, footprint: newFootprint });
    }
  }

  console.log(`Parts needing update: ${updates.length}\n`);

  let done = 0;
  for (const u of updates) {
    const patch = {};
    if (u.value !== null)     patch.value = u.value;
    if (u.footprint !== null) patch.footprint = u.footprint;
    if (!Object.keys(patch).length) continue;

    const { error: upErr } = await supabase.from("parts").update(patch).eq("part_num", u.part_num);
    if (upErr) throw new Error(`${u.part_num}: ${upErr.message}`);
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${updates.length}…`);
  }
  console.log(`  ${done}/${updates.length} done\n`);

  // Samples
  const valueHits = updates.filter((u) => u.value).slice(0, 3);
  const fpHits    = updates.filter((u) => u.footprint).slice(0, 3);
  if (valueHits.length) {
    console.log("Value samples:");
    valueHits.forEach((u) => {
      const p = parts.find((x) => x.part_num === u.part_num);
      console.log(`  ${u.value}  ← ${p?.description?.slice(0, 60)}`);
    });
  }
  if (fpHits.length) {
    console.log("\nFootprint samples:");
    fpHits.forEach((u) => {
      const p = parts.find((x) => x.part_num === u.part_num);
      console.log(`  ${u.footprint}  ← ${p?.description?.slice(0, 60)}`);
    });
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
