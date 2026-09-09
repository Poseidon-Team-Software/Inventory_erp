// Parses the ANSI MH10.8.2 / ISO 15434 structured payload encoded in the 2D
// Data Matrix barcode on Mouser (and DigiKey) packing labels — e.g.
// "[)>...P<mouser p/n><GS>1P<mfr p/n><GS>...Q<qty><GS>...". Fields are
// separated by the Group/Record Separator control characters; we only pull
// out the identifiers we act on (Mouser P/N, manufacturer P/N, quantity)
// and ignore the rest (PO, lot code, country of origin, etc).

const SEPARATOR = /[\x1D\x1E]/;

const FIELD_MAP = [
  { prefix: "1P", key: "manufacturerPartNumber" as const },
  { prefix: "P", key: "mouserPartNumber" as const },
  { prefix: "Q", key: "quantity" as const },
].sort((a, b) => b.prefix.length - a.prefix.length);

export type ParsedSupplierLabel = {
  mouserPartNumber: string | null;
  manufacturerPartNumber: string | null;
  quantity: number | null;
};

export function parseSupplierLabel(raw: string): ParsedSupplierLabel | null {
  if (!raw.startsWith("[)>")) return null;

  const body = raw
    .slice(3)
    .replace(/^[\x1D\x1E]?06[\x1D\x1E]?/, "")
    .replace(/[\x1D\x1E]?\x04$/, "");

  const segments = body.split(SEPARATOR).map((s) => s.trim()).filter(Boolean);

  const result: ParsedSupplierLabel = {
    mouserPartNumber: null,
    manufacturerPartNumber: null,
    quantity: null,
  };

  for (const segment of segments) {
    const field = FIELD_MAP.find((f) => segment.startsWith(f.prefix));
    if (!field) continue;
    const value = segment.slice(field.prefix.length).trim();
    if (!value) continue;

    if (field.key === "quantity") {
      const n = Number(value);
      if (!Number.isNaN(n)) result.quantity = n;
    } else {
      result[field.key] = value;
    }
  }

  const found = result.mouserPartNumber || result.manufacturerPartNumber || result.quantity !== null;
  return found ? result : null;
}
