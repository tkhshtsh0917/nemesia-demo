import reviewedPrefixes from "../../data/fineweb-ime-prefixes.json" with {
  type: "json",
};

const prefixAlternatives = new Map(Object.entries(reviewedPrefixes));

/** Validates a native-generated replacement table before mixed IME use. */
export function readRules(value: unknown): ReadonlyMap<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("invalid rules");
  const rows = Object.entries(value);
  if (rows.length > 4096) throw new Error("too many rules");
  for (const [key, output] of rows) {
    if (
      !/^[\u3041-\u3096\u30a1-\u30faー]{1,2}$/u.test(key) ||
      typeof output !== "string" ||
      !/^[a-z'-]{1,12}$/.test(output)
    )
      throw new Error("invalid rule");
  }
  return new Map(rows);
}

/** Produces at most one alternate spelling without replacing the original input. */
export function queryVariant(
  raw: string,
  rules: ReadonlyMap<string, string>,
): string | undefined {
  if (raw.length > 256) return;
  const input = raw.normalize("NFKC");
  const reviewed = prefixAlternatives.get(input.toLowerCase());
  if (reviewed !== undefined) return reviewed;

  if (!/[a-z]/i.test(input) || !/[\u3041-\u3096\u30a1-\u30faー]/u.test(input))
    return;
  const chars = Array.from(input);
  let out = "";
  let changed = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const pair =
      chars[i + 1] === undefined ? undefined : rules.get(char + chars[i + 1]);
    const replacement = pair ?? rules.get(char);
    if (pair !== undefined) i++;
    out += replacement ?? char;
    changed ||= replacement !== undefined;
  }
  if (!changed || out === input || Array.from(out).length > 128) return;
  return prefixAlternatives.get(out.toLowerCase()) ?? out;
}
