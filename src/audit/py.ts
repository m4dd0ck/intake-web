/**
 * Python behaviour the audit text depends on, so findings read exactly as DataIntake writes them.
 *
 * JavaScript differs from Python in small ways that change visible output: `trim` strips a
 * narrower set of whitespace, number formatting rounds half up, and there is no `repr`.
 */

// Reason: the characters Python's str.isspace() accepts; JS \s misses \x1c-\x1f and \x85.
export const PY_SPACE =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const RUNS = new RegExp(`[${PY_SPACE}]+`, "u");

function isSpaceCode(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    (code >= 0x1c && code <= 0x1f) ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

/** Python `str.strip()`. */
export function strip(value: string): string {
  // Reason: index scanning instead of regex; this runs on every cell, several times.
  let start = 0;
  let end = value.length;
  while (start < end && isSpaceCode(value.charCodeAt(start))) start += 1;
  while (end > start && isSpaceCode(value.charCodeAt(end - 1))) end -= 1;
  return start === 0 && end === value.length ? value : value.slice(start, end);
}

/** Python `str.split()` with no argument: split on whitespace runs, drop empty parts. */
export function splitWhitespace(value: string): string[] {
  const stripped = strip(value);
  return stripped === "" ? [] : stripped.split(RUNS);
}

/** Python `" ".join(value.split())`. */
export function collapseSpaces(value: string): string {
  return splitWhitespace(value).join(" ");
}

// Reason: Python's str.isprintable() is false for these categories (space itself is printable).
const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** Python `repr()` of a string, e.g. `'us '` or `"it's"`. */
export function pyRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const char of value) {
    out += reprChar(char, quote);
  }
  return out + quote;
}

function reprChar(char: string, quote: string): string {
  if (char === "\\" || char === quote) return `\\${char}`;
  if (char === "\t") return "\\t";
  if (char === "\n") return "\\n";
  if (char === "\r") return "\\r";
  if (char === " " || !NOT_PRINTABLE.test(char)) return char;
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x100) return `\\x${code.toString(16).padStart(2, "0")}`;
  if (code < 0x10000) return `\\u${code.toString(16).padStart(4, "0")}`;
  return `\\U${code.toString(16).padStart(8, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(digits: number, grouping: boolean): Intl.NumberFormat {
  const key = `${digits}:${grouping}`;
  let cached = formatters.get(key);
  if (!cached) {
    // Reason: Python rounds the exact binary value half to even; so does halfEven here.
    cached = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      roundingMode: "halfEven",
      useGrouping: grouping,
    });
    formatters.set(key, cached);
  }
  return cached;
}

/** Python `f"{number:,.{digits}f}"`. */
export function formatGrouped(number: number, digits: number): string {
  return normaliseMinus(formatter(digits, true).format(number));
}

/** Python `f"{number:.{digits}f}"`. */
export function formatFixed(number: number, digits: number): string {
  return normaliseMinus(formatter(digits, false).format(number));
}

function normaliseMinus(text: string): string {
  // Reason: Intl may print "-0"; Python prints "-0" too, so only the minus sign is normalised.
  return text.replace("−", "-");
}

/** Python `round(number, digits)`. */
export function pyRound(number: number, digits: number): number {
  return Number(formatFixed(number, digits));
}

/** Python `str(int)` for a whole float, without JS exponent notation above 1e21. */
export function intText(number: number): string {
  return BigInt(number).toString();
}

/** Python `repr(float)`: shortest round-trip digits, exponent below 1e-4 or from 1e16. */
export function floatRepr(number: number): string {
  if (Number.isNaN(number)) return "nan";
  if (!Number.isFinite(number)) return number > 0 ? "inf" : "-inf";
  if (Number.isInteger(number) && Math.abs(number) < 1e16) return `${intText(number)}.0`;
  const [mantissa = "0", exponentText = "0"] = number.toExponential().split("e");
  const exponent = Number(exponentText);
  if (exponent < -4 || exponent >= 16) {
    const sign = exponent < 0 ? "-" : "+";
    return `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  return String(number);
}

/** Python `statistics.quantiles(data, n=4)` (the default "exclusive" method). */
export function quartiles(values: readonly number[]): [number, number, number] {
  const data = [...values].sort((a, b) => a - b);
  const size = data.length;
  if (size < 2) throw new RangeError("quartiles need at least two values");
  const n = 4;
  const m = size + 1;
  const result: number[] = [];
  for (let i = 1; i < n; i += 1) {
    const raw = Math.floor((i * m) / n);
    const j = raw < 1 ? 1 : raw > size - 1 ? size - 1 : raw;
    const delta = i * m - j * n;
    const below = data[j - 1] ?? 0;
    const above = data[j] ?? 0;
    result.push((below * (n - delta) + above * delta) / n);
  }
  return [result[0] ?? 0, result[1] ?? 0, result[2] ?? 0];
}

/** Code-point string comparison, the order Python's `sorted` uses for `str`. */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  const a = Array.from(left);
  const b = Array.from(right);
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i]?.codePointAt(0) ?? 0;
    const y = b[i]?.codePointAt(0) ?? 0;
    if (x !== y) return x - y;
  }
  return a.length - b.length;
}

/** Python `sorted(strings)`. */
export function sortedText(values: Iterable<string>): string[] {
  return [...values].sort(compareText);
}
