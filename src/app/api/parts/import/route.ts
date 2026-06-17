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
  | "IC" | "Connector" | "Crystal" | "Switch" | "LED" | "Fuse" | "Other";

function mapCategory(raw: string = ""): PartCategory {
  const c = raw.toLowerCase();
  if (c.includes("resistor")) return "Resistor";
  if (c.includes("capacitor")) return "Capacitor";
  if (c.includes("inductor") || c.includes("ferrite") || c.includes("coil")) return "Inductor";
  if (c.includes("diode") || c.includes("rectifier") || c.includes("schottky") || c.includes("zener")) return "Diode";
  if (c.includes("transistor") || c.includes("mosfet") || c.includes("bjt") || c.includes("igbt")) return "Transistor";
  if (c.includes("connector") || c.includes("header") || c.includes("socket") || c.includes("terminal")) return "Connector";
  if (c.includes("crystal") || c.includes("oscillator") || c.includes("resonator")) return "Crystal";
  if (c.includes("switch") || c.includes("button") || c.includes("relay")) return "Switch";
  if (c.includes("led") || c.includes("emitter")) return "LED";
  if (c.includes("fuse") || c.includes("ptc") || c.includes("polyfuse")) return "Fuse";
  if (
    c.includes("ic") || c.includes("integrated") || c.includes("microcontroller") ||
    c.includes("mcu") || c.includes("processor") || c.includes("amplifier") ||
    c.includes("regulator") || c.includes("driver") || c.includes("controller")
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
      value: null as string | null,
      footprint: null as string | null,
      manufacturer: p.Manufacturer ?? null,
      manufacturer_part_num: p.ManufacturerPartNumber ?? null,
      description: p.Description ?? null,
      datasheet_url: p.DataSheetUrl ?? null,
      image: p.ImagePath ?? null,
      mouser_details: p,
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
