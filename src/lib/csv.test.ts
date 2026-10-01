import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv";

describe("CSV cell export safety", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "  =1+1"])("neutralizes spreadsheet formula %s", (value) => {
    expect(escapeCsvCell(value)).toBe(`'${value}`);
  });

  it("quotes delimiters and doubles embedded quotes", () => {
    expect(escapeCsvCell('Smith, "Alex"')).toBe('"Smith, ""Alex"""');
    expect(escapeCsvCell("first line\nsecond line")).toBe('"first line\nsecond line"');
  });

  it("leaves ordinary values readable", () => expect(escapeCsvCell("Case 101")).toBe("Case 101"));
});
