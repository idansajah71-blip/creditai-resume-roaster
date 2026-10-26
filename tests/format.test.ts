import { describe, it, expect } from "vitest";
import { formatCredits } from "@/lib/format";

describe("formatCredits", () => {
  it("singular", () => expect(formatCredits(1)).toBe("1 credit"));
  it("plural", () => expect(formatCredits(5)).toBe("5 credits"));
});