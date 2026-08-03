import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupMouserPartByNumber } from "@/lib/mouser";

type ImportRow = {
  part_num?: string;
  manufacturer_part_num?: string;
  quantity: number;
  designator?: string;
  notes?: string;
};

type RowError = { rowIndex: number; identifier: string; reason: string };
type DuplicateDesignator = { rowIndex: number; designator: string; identifier: string };

type ResolvedRow = {
  part_num: string;
  quantity: number;
  designator: string | null;
  notes: string | null;
};

const MOUSER_CONCURRENCY = 4;

// Runs `fn` over `items` with at most `limit` in flight at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const { rows } = (await req.json()) as { rows?: ImportRow[] };
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("proj_id")
    .eq("proj_id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ── 1. Dedupe by designator (first non-blank wins; nulls never collide) ──
  const duplicateDesignators: DuplicateDesignator[] = [];
  const seenDesignators = new Set<string>();
  const deduped: { row: ImportRow; rowIndex: number }[] = [];

  rows.forEach((row, rowIndex) => {
    const designator = row.designator?.trim() || null;
    const identifier = row.part_num?.trim() || row.manufacturer_part_num?.trim() || "(missing)";
    if (designator) {
      const key = designator.toLowerCase();
      if (seenDesignators.has(key)) {
        duplicateDesignators.push({ rowIndex, designator, identifier });
        return;
      }
      seenDesignators.add(key);
    }
    deduped.push({ row, rowIndex });
  });

  // ── 2. Validate quantity, split out rows that need resolving ──
  const errors: RowError[] = [];
  const toResolve: { row: ImportRow; rowIndex: number; designator: string | null; identifier: string }[] = [];

  for (const { row, rowIndex } of deduped) {
    const partNum = row.part_num?.trim() || "";
    const mpn = row.manufacturer_part_num?.trim() || "";
    const identifier = partNum || mpn || "(missing)";
    const designator = row.designator?.trim() || null;

    if (!partNum && !mpn) {
      errors.push({ rowIndex, identifier, reason: "missing part_num and manufacturer_part_num" });
      continue;
    }
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.push({ rowIndex, identifier, reason: "quantity must be a positive integer" });
      continue;
    }
    toResolve.push({ row: { ...row, part_num: partNum, manufacturer_part_num: mpn, quantity }, rowIndex, designator, identifier });
  }

  // ── 3. Resolve each row's part_num: exact match → MPN match → Mouser fallback ──
  const { data: existingParts } = await supabase.from("parts").select("part_num, manufacturer_part_num");
  const byPartNum = new Map<string, string>();
  const byMpn = new Map<string, string>();
  for (const p of existingParts ?? []) {
    byPartNum.set(p.part_num, p.part_num);
    if (p.manufacturer_part_num) byMpn.set(p.manufacturer_part_num.toLowerCase(), p.part_num);
  }

  const apiKey = process.env.MOUSER_API_KEY;
  const mouserCache = new Map<string, string | null>(); // identifier -> resolved part_num | null
  const createdParts: string[] = [];

  const needsMouser = toResolve.filter(({ row }) => {
    if (row.part_num && byPartNum.has(row.part_num)) return false;
    if (row.manufacturer_part_num && byMpn.has(row.manufacturer_part_num.toLowerCase())) return false;
    return true;
  });
  const uniqueMouserIdentifiers = [...new Set(needsMouser.map(({ identifier }) => identifier))];

  if (apiKey && uniqueMouserIdentifiers.length > 0) {
    await mapWithConcurrency(uniqueMouserIdentifiers, MOUSER_CONCURRENCY, async (identifier) => {
      const found = await lookupMouserPartByNumber(identifier, apiKey);
      if (!found) {
        mouserCache.set(identifier, null);
        return;
      }
      const { error } = await supabase.from("parts").upsert(found, { onConflict: "part_num" });
      if (error) {
        mouserCache.set(identifier, null);
        return;
      }
      mouserCache.set(identifier, found.part_num);
      createdParts.push(found.part_num);
    });
  }

  const resolvedRows: ResolvedRow[] = [];
  for (const { row, rowIndex, designator, identifier } of toResolve) {
    let resolvedPartNum: string | null = null;
    if (row.part_num && byPartNum.has(row.part_num)) {
      resolvedPartNum = row.part_num;
    } else if (row.manufacturer_part_num && byMpn.has(row.manufacturer_part_num.toLowerCase())) {
      resolvedPartNum = byMpn.get(row.manufacturer_part_num.toLowerCase())!;
    } else if (mouserCache.has(identifier)) {
      resolvedPartNum = mouserCache.get(identifier)!;
    }

    if (!resolvedPartNum) {
      errors.push({ rowIndex, identifier, reason: "not found in DB or Mouser" });
      continue;
    }

    resolvedRows.push({
      part_num: resolvedPartNum,
      quantity: row.quantity,
      designator,
      notes: row.notes?.trim() || null,
    });
  }

  // ── 4. Abort before touching bom/inventory if nothing resolved ──
  if (resolvedRows.length === 0) {
    return NextResponse.json({ imported: 0, createdParts, errors, duplicateDesignators });
  }

  // ── 5. Clear the existing BOM. Inventory is left untouched here, same as
  //        the single-part "Add to BOM" flow — BOM quantity is "needed",
  //        not a reservation against physical stock. ──
  const { error: deleteError } = await supabase.from("bom").delete().eq("project_id", projectId);
  if (deleteError) {
    return NextResponse.json({ error: `Failed to clear existing BOM: ${deleteError.message}` }, { status: 500 });
  }

  // ── 6. Insert the new BOM ──
  const { error: insertError } = await supabase.from("bom").insert(
    resolvedRows.map((r) => ({
      project_id: projectId,
      part_num: r.part_num,
      quantity: r.quantity,
      designator: r.designator,
      notes: r.notes,
    }))
  );

  if (insertError) {
    return NextResponse.json(
      {
        error: `BOM was cleared but the new rows failed to insert: ${insertError.message}. Every row was already resolved to a known part_num, so retrying this exact import is cheap and safe — it will do no Mouser calls.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ imported: resolvedRows.length, createdParts, errors, duplicateDesignators });
}
