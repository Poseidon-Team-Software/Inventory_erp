/**
 * Seed script — pulls ~400 real parts from Mouser and upserts into Supabase.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (bypasses RLS).
 *
 * Usage:  node scripts/seed-parts.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── env ─────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq === -1 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, eq).trim();
  const val = line.slice(eq + 1).trim();
  if (key) env[key] = val;
}

const SUPABASE_URL     = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MOUSER_API_KEY   = env.MOUSER_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !MOUSER_API_KEY) {
  console.error(
    "Missing env vars. Ensure .env.local has:\n" +
    "  NEXT_PUBLIC_SUPABASE_URL\n" +
    "  SUPABASE_SERVICE_ROLE_KEY\n" +
    "  MOUSER_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const MOUSER_URL = "https://api.mouser.com/api/v1/search/keyword";

// ── Mouser helper ────────────────────────────────────────────────────────────

async function mouserSearch(keyword, records = 50, startingRecord = 0) {
  const res = await fetch(`${MOUSER_URL}?apiKey=${MOUSER_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      SearchByKeywordRequest: {
        keyword,
        records,
        startingRecord,
        searchOptions: "",
        searchWithSVHC: false,
      },
    }),
  });
  if (!res.ok) throw new Error(`Mouser HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.Errors?.length) throw new Error(`Mouser: ${data.Errors[0].Message}`);
  return data.SearchResults?.Parts ?? [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Part builder ─────────────────────────────────────────────────────────────

function buildRow(p, category) {
  return {
    part_num:              p.MouserPartNumber,
    category,
    value:                 null,
    footprint:             null,
    manufacturer:          p.Manufacturer             ?? null,
    manufacturer_part_num: p.ManufacturerPartNumber   ?? null,
    description:           p.Description              ?? null,
    datasheet_url:         p.DataSheetUrl             ?? null,
    image:                 p.ImagePath                ?? null,
    mouser_details:        p,
  };
}

// ── Batch fetcher ─────────────────────────────────────────────────────────────
// queries: [{ keyword, category }]
// globalSeen: Set of part_nums already collected (cross-category dedup)

async function fetchBatch(queries, globalSeen, limit) {
  const parts = [];
  const localSeen = new Set();

  for (const { keyword, category } of queries) {
    if (parts.length >= limit) break;
    const need = limit - parts.length;
    console.log(`  › "${keyword}"  [need ${need}]`);

    let raw = [];
    try {
      raw = await mouserSearch(keyword, Math.min(need + 5, 50));
    } catch (e) {
      console.error(`    ✗ ${e.message}`);
      await sleep(2000);
      continue;
    }

    let added = 0;
    for (const p of raw) {
      if (!p.MouserPartNumber) continue;
      if (localSeen.has(p.MouserPartNumber)) continue;
      if (globalSeen.has(p.MouserPartNumber)) continue;
      localSeen.add(p.MouserPartNumber);
      globalSeen.add(p.MouserPartNumber);
      parts.push(buildRow(p, category));
      added++;
      if (parts.length >= limit) break;
    }
    console.log(`    + ${added} parts  (total ${parts.length}/${limit})`);
    await sleep(1200); // stay well under Mouser rate limit
  }

  return parts;
}

// ── Supabase upsert ──────────────────────────────────────────────────────────

async function upsert(parts, label) {
  if (parts.length === 0) {
    console.log(`  ⚠  No parts to insert for ${label}`);
    return;
  }
  const { data, error } = await supabase
    .from("parts")
    .upsert(parts, { onConflict: "part_num" })
    .select("part_num");
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  console.log(`  ✓ ${data.length} ${label} parts upserted\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const globalSeen = new Set();
  console.log("═══════════════════════════════════════");
  console.log(" Inventory ERP — Part Seed Script");
  console.log("═══════════════════════════════════════\n");

  // ── 1. RESISTORS ────────────────────────────────────────────────────────────
  console.log("【RESISTORS — target 100】");
  const resistors = await fetchBatch([
    { keyword: "0402 thick film chip resistor 10k",   category: "Resistor" },
    { keyword: "0603 SMD resistor 100 ohm 1%",         category: "Resistor" },
    { keyword: "0805 SMD resistor 4.7k",               category: "Resistor" },
    { keyword: "1206 chip resistor 1M ohm",            category: "Resistor" },
    { keyword: "0402 resistor 100k 5% SMD",            category: "Resistor" },
  ], globalSeen, 100);
  await upsert(resistors, "Resistor");

  // ── 2. CAPACITORS ───────────────────────────────────────────────────────────
  console.log("【CAPACITORS — target 100】");
  const capacitors = await fetchBatch([
    { keyword: "0402 MLCC ceramic capacitor 100nF X5R",   category: "Capacitor" },
    { keyword: "0603 ceramic capacitor 10uF X5R",         category: "Capacitor" },
    { keyword: "electrolytic aluminum capacitor 100uF 25V", category: "Capacitor" },
    { keyword: "electrolytic capacitor 470uF 16V",         category: "Capacitor" },
    { keyword: "tantalum capacitor SMD 10uF",              category: "Capacitor" },
  ], globalSeen, 100);
  await upsert(capacitors, "Capacitor");

  // ── 3. GADGETS ──────────────────────────────────────────────────────────────
  console.log("【GADGETS — target 100 (transistors / thermistors / sensors)】");
  const gadgets = await fetchBatch([
    { keyword: "NPN general purpose BJT transistor SOT-23",     category: "Transistor" },
    { keyword: "PNP transistor signal switching SOT-23",        category: "Transistor" },
    { keyword: "BF NPN RF transistor HF signal",               category: "Transistor" },
    { keyword: "NTC thermistor 10k temperature sensor",        category: "Thermistor" },
    { keyword: "NTC thermistor 100k NXP Murata",               category: "Thermistor" },
    { keyword: "photoresistor light dependent resistor LDR",   category: "Sensor" },
    { keyword: "phototransistor photodetector optical sensor", category: "Sensor" },
    { keyword: "infrared detector IR receiver photodiode",     category: "Sensor" },
  ], globalSeen, 100);
  await upsert(gadgets, "Gadget");

  // ── 4. CHIPS ────────────────────────────────────────────────────────────────
  console.log("【CHIPS — target 100 (op-amps / regulators / ADC)】");
  const chips = await fetchBatch([
    { keyword: "single op-amp rail-to-rail CMOS operational amplifier",  category: "Op_Amp" },
    { keyword: "dual op-amp precision low noise Analog Devices",         category: "Op_Amp" },
    { keyword: "quad op-amp TI Texas Instruments general purpose",       category: "Op_Amp" },
    { keyword: "instrumentation amplifier INA Analog Devices",           category: "Op_Amp" },
    { keyword: "LDO low dropout voltage regulator 3.3V 500mA",          category: "Voltage_Regulator" },
    { keyword: "LDO linear voltage regulator adjustable 1A",            category: "Voltage_Regulator" },
    { keyword: "12-bit ADC SPI analog digital converter",               category: "ADC_DAC" },
    { keyword: "16-bit ADC low power delta-sigma converter",            category: "ADC_DAC" },
  ], globalSeen, 100);
  await upsert(chips, "Chip");

  console.log("═══════════════════════════════════════");
  console.log(" Done! Total unique parts added: " + globalSeen.size);
  console.log("═══════════════════════════════════════");
}

main().catch((e) => {
  console.error("\nFatal:", e.message);
  process.exit(1);
});
