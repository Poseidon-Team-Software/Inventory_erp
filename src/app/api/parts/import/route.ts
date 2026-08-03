import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mouserPartToRow, type MouserPart } from "@/lib/mouser";

const MOUSER_URL = "https://api.mouser.com/api/v1/search/keyword";

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
    .map(mouserPartToRow);

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
