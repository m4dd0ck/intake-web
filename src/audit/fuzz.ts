/**
 * The two rapidfuzz scores DataIntake uses, with rapidfuzz 3 defaults (no preprocessing, so
 * case matters): `ratio` is the normalised Indel similarity, 100 * 2 * LCS / (len1 + len2).
 */

import { compareText, splitWhitespace } from "./py";

function longestCommonSubsequence(left: readonly string[], right: readonly string[]): number {
  const previous = new Uint16Array(right.length + 1);
  const current = new Uint16Array(right.length + 1);
  for (const char of left) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] =
        char === right[j - 1]
          ? (previous[j - 1] ?? 0) + 1
          : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    previous.set(current);
  }
  return previous[right.length] ?? 0;
}

/** `rapidfuzz.fuzz.ratio`: 0-100, compared by Unicode code point. */
export function ratio(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const total = a.length + b.length;
  if (total === 0) return 100;
  return (100 * 2 * longestCommonSubsequence(a, b)) / total;
}

/** Upper bound of `ratio` from lengths alone, used to skip pairs that cannot reach a cutoff. */
export function maxRatio(leftLength: number, rightLength: number): number {
  const total = leftLength + rightLength;
  return total === 0 ? 100 : (100 * 2 * Math.min(leftLength, rightLength)) / total;
}

/** `rapidfuzz.fuzz.token_sort_ratio`: `ratio` after sorting whitespace-separated words. */
export function tokenSortRatio(left: string, right: string): number {
  const sortWords = (text: string): string => splitWhitespace(text).sort(compareText).join(" ");
  return ratio(sortWords(left), sortWords(right));
}
