import { describe, expect, it } from "bun:test";
import { createDiff } from "../tools/diff";

describe("diff generation", () => {
  it("returns an empty string when content is unchanged", () => {
    expect(createDiff("a.ts", "same", "same")).toBe("");
  });

  it("returns an empty string for two empty contents", () => {
    expect(createDiff("a.ts", "", "")).toBe("");
  });

  it("includes file headers with the file path", () => {
    const diff = createDiff("src/app.ts", "a", "a\nb");
    expect(diff).toContain("--- a/src/app.ts");
    expect(diff).toContain("+++ b/src/app.ts");
  });

  it("represents an added line with a + prefix", () => {
    const diff = createDiff("a.ts", "line1\nline2", "line1\nline2\nline3");
    expect(diff).toContain("\n+ line3");
  });

  it("represents a removed line with a - prefix", () => {
    const diff = createDiff("a.ts", "line1\nline2\nline3", "line1\nline3");
    expect(diff).toContain("\n- line2\n");
  });

  it("represents a modified line as removal and addition", () => {
    const diff = createDiff("a.ts", "a\nb\nc", "a\nX\nc");
    expect(diff).toContain("\n- b\n");
    expect(diff).toContain("\n+ X\n");
  });

  it("includes a hunk header with old and new ranges", () => {
    const diff = createDiff("a.ts", "a\nb\nc", "a\nb\nc\nd");
    expect(diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  it("keeps context lines around a change", () => {
    const diff = createDiff("a.ts", "a\nb\nc", "a\nX\nc");
    expect(diff).toContain(" a\n");
    expect(diff).toContain(" c");
  });

  it("creates a new file diff from empty content", () => {
    const diff = createDiff("new.txt", "", "hello\nworld");
    expect(diff).toContain("--- a/new.txt");
    expect(diff).toContain("+ hello");
    expect(diff).toContain("+ world");
  });

  it("creates a deletion diff to empty content", () => {
    const diff = createDiff("old.txt", "a\nb", "");
    expect(diff).toContain("- a");
    expect(diff).toContain("- b");
  });

  it("produces separate hunks for far-apart changes", () => {
    const oldContent = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join(
      "\n",
    );
    const newContent = oldContent.replace("line5", "CHANGED5").replace(
      "line18",
      "CHANGED18",
    );
    const diff = createDiff("a.ts", oldContent, newContent);
    const hunkMatches = diff.match(/@@ /g);
    expect(hunkMatches?.length).toBe(2);
    expect(diff).toContain("- line5");
    expect(diff).toContain("+ CHANGED5");
    expect(diff).toContain("- line18");
    expect(diff).toContain("+ CHANGED18");
  });

  it("orders removal before addition for replacements", () => {
    const diff = createDiff("a.ts", "x", "y");
    const removeIdx = diff.indexOf("- x");
    const addIdx = diff.indexOf("+ y");
    expect(removeIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(removeIdx);
  });
});
