import { describe, expect, it } from "vitest";
import { maskUuid } from "./utils";

describe("maskUuid", () => {
  it("masks the three middle segments", () => {
    expect(maskUuid("a3cecd59-2ee1-4c60-8376-67b26e16b76e")).toBe(
      "a3cecd59-xxxx-xxxx-xxxx-67b26e16b76e",
    );
  });

  it("preserves first and last segments", () => {
    const result = maskUuid("11111111-2222-3333-4444-555555555555");
    expect(result.startsWith("11111111-")).toBe(true);
    expect(result.endsWith("-555555555555")).toBe(true);
  });

  it("returns xxxx for non-UUID strings", () => {
    expect(maskUuid("not-a-uuid")).toBe("xxxx");
    expect(maskUuid("")).toBe("xxxx");
    expect(maskUuid("abc")).toBe("xxxx");
  });
});
