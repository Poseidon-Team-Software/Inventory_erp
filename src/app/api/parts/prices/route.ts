import { NextRequest, NextResponse } from "next/server";

type PriceBreak = { Quantity: number; Price: string; Currency: string };

export async function GET(req: NextRequest) {
  const apiKey = process.env.MOUSER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "MOUSER_API_KEY not configured" }, { status: 500 });

  const partNum = req.nextUrl.searchParams.get("partNum");
  if (!partNum) return NextResponse.json({ error: "partNum is required" }, { status: 400 });

  const res = await fetch(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      SearchByPartNumberRequest: { mouserPartNumber: partNum, partSearchOptions: "" },
    }),
  });

  if (!res.ok) return NextResponse.json({ error: `Mouser returned ${res.status}` }, { status: 502 });

  const data = await res.json();
  if (data.Errors?.length) return NextResponse.json({ error: data.Errors[0].Message }, { status: 502 });

  const part = data.SearchResults?.Parts?.[0];
  if (!part) return NextResponse.json({ prices: [] });

  const prices: PriceBreak[] = (part.PriceBreaks ?? []).map((pb: Record<string, unknown>) => ({
    Quantity: pb.Quantity,
    Price: pb.Price,
    Currency: pb.Currency,
  }));

  return NextResponse.json({ prices, availability: part.Availability ?? null });
}
