import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentVersion, calculateNextVersion } from "../utils/version";
import * as fs from "fs/promises";
import { join } from "path";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("Version Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCurrentVersion", () => {
    const outputDir = "generated";
    const filename = "schema.ts";

    it("should return version 0 and null hash when file doesn't exist", async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("File not found"));

      const result = await getCurrentVersion(outputDir, filename);

      expect(result).toEqual({ version: 0, hash: null });
      expect(fs.readFile).toHaveBeenCalledWith(join(outputDir, filename), "utf-8");
    });

    it("should parse version and hash from old format", async () => {
      const mockContent = `
        // Some content
        version: 42
        // Schema hash: abc123def456
      `;
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

      const result = await getCurrentVersion(outputDir, filename);

      expect(result).toEqual({
        version: 42,
        hash: "abc123def456",
      });
    });

    it("should parse version and hash from new format", async () => {
      const mockContent = `
        // Some content
        export const schema = createSchema(
          5,
          {
            // ... schema content
          }
        );
        // Schema hash: abc789def123
      `;
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

      const result = await getCurrentVersion(outputDir, filename);

      expect(result).toEqual({
        version: 5,
        hash: "abc789def123",
      });
    });

    it("should return version 0 when version is not found", async () => {
      const mockContent = `
        // Some content without version
        // Schema hash: abc123
      `;
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

      const result = await getCurrentVersion(outputDir, filename);

      expect(result).toEqual({
        version: 0,
        hash: "abc123",
      });
    });

    it("should return null hash when hash is not found", async () => {
      const mockContent = `
        // Some content
        version: 3
        // No hash here
      `;
      vi.mocked(fs.readFile).mockResolvedValueOnce(mockContent);

      const result = await getCurrentVersion(outputDir, filename);

      expect(result).toEqual({
        version: 3,
        hash: null,
      });
    });
  });

  describe("calculateNextVersion", () => {
    it("should return configVersion when provided", () => {
      const result = calculateNextVersion(1, "abc", "def", 42);
      expect(result).toBe(42);
    });

    it("should increment version when hash changes", () => {
      const result = calculateNextVersion(1, "abc", "def", undefined);
      expect(result).toBe(2);
    });

    it("should not increment version when hash remains the same", () => {
      const result = calculateNextVersion(5, "abc", "abc", undefined);
      expect(result).toBe(5);
    });

    it("should return 1 when current version is 0 and hash remains the same", () => {
      const result = calculateNextVersion(0, "abc", "abc", undefined);
      expect(result).toBe(1);
    });

    it("should increment version when current hash is null", () => {
      const result = calculateNextVersion(1, null, "abc", undefined);
      expect(result).toBe(2);
    });

    it("should handle version 0 with null hash", () => {
      const result = calculateNextVersion(0, null, "abc", undefined);
      expect(result).toBe(1);
    });
  });
}); 
