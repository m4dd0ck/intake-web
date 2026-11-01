import { describe, expect, it } from "vitest";
import { check } from "../src/audit/checks/structure";
import { buildContext } from "../src/audit/context";
import { AS_OF, codes, table } from "./helpers/context";

describe("structure check", () => {
  it("reports title rows, renamed headers and empty columns", () => {
    const raw = table(
      ["name", "unnamed_2", "name_2"],
      [
        ["Ana", null, "x"],
        ["Bo", null, "y"],
      ],
      "customers",
      {
        headerRow: 2,
        renamedColumns: new Map([
          ["unnamed_2", ""],
          ["name_2", "name"],
        ]),
      },
    );
    const found = check(buildContext(raw, AS_OF));
    expect(codes(found)).toEqual(new Set(["title_rows", "bad_headers", "empty_columns"]));
    expect(found.find((f) => f.code === "bad_headers")?.examples).toEqual([
      "unnamed_2 (was blank)",
      "name_2 (was 'name')",
    ]);
  });

  it("says nothing about a clean table", () => {
    expect(check(buildContext(table(["a", "b"], [["1", "2"]]), AS_OF))).toEqual([]);
  });
});
