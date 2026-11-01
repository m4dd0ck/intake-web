// Expected values were printed by Python 3.12.
import { describe, expect, it } from "vitest";
import {
  collapseSpaces,
  floatRepr,
  formatFixed,
  formatGrouped,
  pyRepr,
  pyRound,
  quartiles,
  sortedText,
  strip,
} from "../src/audit/py";

describe("Python-compatible helpers", () => {
  it("strips the whitespace Python strips, including characters JS trim keeps", () => {
    expect(strip("\x1c a \x85")).toBe("a");
    expect(collapseSpaces("  Grace\t\tPine ")).toBe("Grace Pine");
  });

  it("writes repr like Python", () => {
    expect(pyRepr("us ")).toBe("'us '");
    expect(pyRepr("it's")).toBe('"it\'s"');
    expect(pyRepr("a\tb ")).toBe("'a\\tb\\xa0'");
  });

  it("rounds half to even like Python formatting", () => {
    expect(formatGrouped(2.5, 0)).toBe("2");
    expect(formatGrouped(1234567.125, 2)).toBe("1,234,567.12");
    expect(formatFixed(0.125, 2)).toBe("0.12");
    expect(pyRound(0.0625, 3)).toBe(0.062);
  });

  it("prints floats like Python repr", () => {
    expect(floatRepr(1.5e-5)).toBe("1.5e-05");
    expect(floatRepr(1e16)).toBe("1e+16");
    expect(floatRepr(1234.56)).toBe("1234.56");
  });

  it("computes statistics.quantiles with the exclusive method", () => {
    expect(quartiles(Array.from({ length: 20 }, (_, i) => i + 1))).toEqual([5.25, 10.5, 15.75]);
  });

  it("sorts by code point, not locale", () => {
    expect(sortedText(["b", "B", "a", "é"])).toEqual(["B", "a", "b", "é"]);
  });
});
