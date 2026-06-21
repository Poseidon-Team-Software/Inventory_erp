import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MOUSER_URL = "https://api.mouser.com/api/v1/search/keyword";

type MouserPart = {
  MouserPartNumber: string;
  ManufacturerPartNumber?: string;
  Manufacturer?: string;
  Description?: string;
  DataSheetUrl?: string;
  ImagePath?: string;
  Category?: string;
  [key: string]: unknown;
};

type PartCategory =
  | "Resistor" | "Capacitor" | "Inductor" | "Diode" | "Transistor"
  | "IC" | "Connector" | "Crystal" | "Switch" | "LED" | "Fuse"
  | "Thermistor" | "Sensor" | "MOSFET" | "Op_Amp" | "Voltage_Regulator"
  | "Logic" | "Gate_Driver" | "ADC_DAC" | "Other";

function extractValue(desc: string | undefined, category: PartCategory): string | null {
  if (!desc) return null;
  if (category === "Resistor" || category === "Thermistor") {
    // "10Kohms", "47K ohm", "1.5Mohm"
    const m1 = desc.match(/\b(\d+(?:\.\d+)?)\s*(k|K|M|G)?\s*[Oo]hms?\b/);
    if (m1) {
      const suffix: Record<string, string> = { k: "kΩ", K: "kΩ", M: "MΩ", G: "GΩ" };
      return `${m1[1]}${suffix[m1[2]] ?? "Ω"}`;
    }
    // "47K", "147K", "1M" — bare multiplier suffix common in Mouser descriptions
    const m2 = desc.match(/\b(\d+(?:\.\d+)?)\s*(k|K|M|G)\b/);
    if (m2) {
      const suffix: Record<string, string> = { k: "kΩ", K: "kΩ", M: "MΩ", G: "GΩ" };
      return `${m2[1]}${suffix[m2[2]]}`;
    }
  }
  if (category === "Capacitor") {
    const m = desc.match(/\.?(\d+(?:\.\d+)?)\s*(p|n|u|µ|μ|m)\s*F\b/i);
    if (m) return `${m[1]}${m[2].toLowerCase().replace(/[µμ]/, "u")}F`;
  }
  if (category === "Inductor") {
    const m = desc.match(/\b(\d+(?:\.\d+)?)\s*(m|u|µ|n)?\s*H\b/i);
    if (m) return `${m[1]}${(m[2] ?? "").toLowerCase().replace(/[µμ]/, "u")}H`;
  }
  return null;
}

function extractFootprint(desc: string | undefined, attrs: Array<{ AttributeName: string; AttributeValue: string }> = []): string | null {
  // Prefer a structured attribute if Mouser provides it
  const attrNames = ["Case Style", "Package / Case", "Package Style", "Case/Package"];
  for (const name of attrNames) {
    const hit = attrs.find((a) => a.AttributeName === name);
    if (hit?.AttributeValue) return hit.AttributeValue;
  }
  if (!desc) return null;
  // SOT-23, SOT23, SOT-89, SOT-223, SOT-363, SOT-323, SOT-353
  const sot = desc.match(/\bSOT[-]?(\d+)(?:-(\d+))?\b/i);
  if (sot) return `SOT-${sot[1]}${sot[2] ? `-${sot[2]}` : ""}`;
  // Standard SMD chip sizes
  const smd = desc.match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/);
  if (smd) return smd[1];
  // DIP, SOIC, TSSOP, MSOP, SSOP, SOP, SC-70
  const pkg = desc.match(/\b(DIP|SOIC|TSSOP|TQFP|TSOP|MSOP|SSOP|WLCSP|SC-70|SC70|PDIP|SPDIP)[-\s]?(\d+)?\b/i);
  if (pkg) return pkg[2] ? `${pkg[1].toUpperCase()}-${pkg[2]}` : pkg[1].toUpperCase();
  // TO-xx
  const to = desc.match(/\bTO[-](\d+)\b/i);
  if (to) return `TO-${to[1]}`;
  return null;
}

function mapCategory(raw: string = ""): PartCategory {
  const c = raw.toLowerCase();
  if (c.includes("thermistor") || c.includes("ntc") || c.includes("ptc temperature")) return "Thermistor";
  if (c.includes("photoresistor") || c.includes("photodetector") || c.includes("phototransistor") || c.includes("light sensor") || c.includes("hall sensor") || c.includes("ir receiver")) return "Sensor";
  if (c.includes("mosfet") || c.includes("fet") || c.includes("igbt")) return "MOSFET";
  if (c.includes("op-amp") || c.includes("op amp") || c.includes("operational amplifier") || c.includes("instrumentation amp") || c.includes("comparator")) return "Op_Amp";
  if (c.includes("ldo") || c.includes("low dropout") || c.includes("voltage regulator") || c.includes("linear regulator")) return "Voltage_Regulator";
  if (c.includes("gate driver") || c.includes("mosfet driver") || c.includes("igbt driver")) return "Gate_Driver";
  if (c.includes("adc") || c.includes("dac") || c.includes("analog-to-digital") || c.includes("digital-to-analog") || c.includes("converter")) return "ADC_DAC";
  if (c.includes("logic") || c.includes("74hc") || c.includes("74ls") || c.includes("buffer") || c.includes("level shift") || c.includes("flip-flop")) return "Logic";
  if (c.includes("resistor")) return "Resistor";
  if (c.includes("capacitor")) return "Capacitor";
  if (c.includes("inductor") || c.includes("ferrite") || c.includes("coil")) return "Inductor";
  if (c.includes("diode") || c.includes("rectifier") || c.includes("schottky") || c.includes("zener")) return "Diode";
  if (c.includes("transistor") || c.includes("bjt")) return "Transistor";
  if (c.includes("connector") || c.includes("header") || c.includes("socket") || c.includes("terminal")) return "Connector";
  if (c.includes("crystal") || c.includes("oscillator") || c.includes("resonator")) return "Crystal";
  if (c.includes("switch") || c.includes("button") || c.includes("relay")) return "Switch";
  if (c.includes("led") || c.includes("emitter")) return "LED";
  if (c.includes("fuse") || c.includes("polyfuse")) return "Fuse";
  if (
    c.includes("ic") || c.includes("integrated") || c.includes("microcontroller") ||
    c.includes("mcu") || c.includes("processor") || c.includes("driver") || c.includes("controller")
  ) return "IC";
  return "Other";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.MOUSER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MOUSER_API_KEY not configured" }, { status: 500 });
  }

  const { query } = await req.json() as { query?: string };
  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const mouserRes = await fetch(`${MOUSER_URL}?apiKey=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      SearchByKeywordRequest: {
        keyword: query.trim(),
        records: 10,
        startingRecord: 0,
        searchOptions: "",
        searchWithSVHC: false,
      },
    }),
  });

  if (!mouserRes.ok) {
    const body = await mouserRes.text().catch(() => "");
    console.error("Mouser error", mouserRes.status, body);
    return NextResponse.json(
      { error: `Mouser returned ${mouserRes.status}`, detail: body },
      { status: 502 }
    );
  }

  const mouserData = await mouserRes.json();

  if (mouserData.Errors?.length) {
    console.error("Mouser body errors:", JSON.stringify(mouserData.Errors));
    return NextResponse.json({ error: mouserData.Errors[0].Message ?? "Mouser error" }, { status: 502 });
  }

  const raw: MouserPart[] = mouserData.SearchResults?.Parts ?? [];
  if (raw.length === 0) {
    return NextResponse.json({ parts: [] });
  }

  const rows = raw
    .filter((p) => p.MouserPartNumber)
    .map((p) => ({
      part_num: p.MouserPartNumber,
      category: mapCategory(p.Category),
      value: extractValue(p.Description, mapCategory(p.Category)),
      footprint: extractFootprint(p.Description, (p.ProductAttributes as Array<{ AttributeName: string; AttributeValue: string }> | undefined) ?? []),
      manufacturer: p.Manufacturer ?? null,
      manufacturer_part_num: p.ManufacturerPartNumber ?? null,
      description: p.Description ?? null,
      datasheet_url: p.DataSheetUrl ?? null,
      image: p.ImagePath ?? null,
      mouser_details: (({ PriceBreaks: _, ...rest }) => rest)(p),
    }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts")
    .upsert(rows, { onConflict: "part_num" })
    .select("part_num, category, value, manufacturer, manufacturer_part_num, description, footprint");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ parts: data });
}
