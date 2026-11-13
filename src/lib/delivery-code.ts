export function formatPackCode(
  stickerId: number | string | null | undefined,
): string {
  if (stickerId === null || stickerId === undefined) return "";
  const num = Number(stickerId);
  if (!Number.isInteger(num) || num <= 0) return "";
  return `PC${num}`;
}

export function formatPackCodeList(
  codes: (number | null | undefined)[],
): string[] {
  const valid = codes
    .filter((code): code is number => typeof code === "number" && Number.isInteger(code) && code > 0)
    .sort((a, b) => a - b);
  return Array.from(new Set(valid)).map((code) => `PC${code}`);
}

export function formatPackCodeSummary(
  codes: (number | null | undefined)[],
): string {
  const uniqueSorted = Array.from(
    new Set(
      codes.filter(
        (code): code is number =>
          typeof code === "number" && Number.isInteger(code) && code > 0,
      ),
    ),
  ).sort((a, b) => a - b);

  if (uniqueSorted.length === 0) return "";
  if (uniqueSorted.length === 1) return `PC${uniqueSorted[0]}`;
  if (uniqueSorted.length === 2) {
    return `PC${uniqueSorted[0]} · PC${uniqueSorted[1]}`;
  }

  let isContiguous = true;
  for (let i = 1; i < uniqueSorted.length; i += 1) {
    if (uniqueSorted[i] !== uniqueSorted[i - 1] + 1) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous) {
    return `PC${uniqueSorted[0]}–PC${uniqueSorted[uniqueSorted.length - 1]}`;
  }

  return `PC${uniqueSorted[0]}, PC${uniqueSorted[1]} +${uniqueSorted.length - 2}`;
}

export function formatShortOrderRef(
  rawRef: string | null | undefined,
  orderId?: string,
): string {
  const source = (rawRef || orderId || "").trim();
  if (!source) return "#PRECHOP";
  if (/^DEMO-\d+$/i.test(source)) return source.toUpperCase();

  const stripped = source.replace(/^prechop-/i, "").replace(/[^a-z0-9]/gi, "");
  const shortHex = (stripped.slice(0, 6) || "ORDER").toUpperCase();
  return `#${shortHex}`;
}

export function formatDisplayAddress(address: string): string {
  const cleaned = address.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned.replace(/^[a-z]/, (ch) => ch.toUpperCase());
}
