import { describe, expect, it } from "vitest";
import { parsePageRange } from "./pageRange";

describe("page range parser", () => {
  it("parses singles and ranges", () => {
    expect(parsePageRange({ value: "1-3, 5", pageCount: 10, fallbackPage: 1 })).toEqual([
      1,
      2,
      3,
      5
    ]);
  });

  it("clamps pages to the document range", () => {
    expect(parsePageRange({ value: "0, 2-9", pageCount: 4, fallbackPage: 1 })).toEqual([
      1,
      2,
      3,
      4
    ]);
  });

  it("falls back to current page when input is blank or invalid", () => {
    expect(parsePageRange({ value: "", pageCount: 10, fallbackPage: 7 })).toEqual([7]);
    expect(parsePageRange({ value: "abc", pageCount: 10, fallbackPage: 7 })).toEqual([7]);
  });
});
