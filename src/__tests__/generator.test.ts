import { describe, it, expect, beforeEach, vi } from "vitest";
import { DMMF, GeneratorOptions } from "@prisma/generator-helper";
import * as fs from "fs/promises";
import { onGenerate } from "../generator";
import { createField, createModel, createMockDMMF } from "./utils";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
}));

function createTestOptions(dmmf: DMMF.Document): GeneratorOptions {
  return {
    generator: {
      output: { value: "generated", fromEnvVar: null },
      name: "test-generator",
      config: {},
      provider: { value: "test-provider", fromEnvVar: null },
      binaryTargets: [],
      previewFeatures: [],
      sourceFilePath: "",
    },
    dmmf,
    schemaPath: "",
    datasources: [],
    otherGenerators: [],
    version: "0.0.0",
    datamodel: "",
  };
}

describe("Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Schema Generation", () => {
    it("should generate correct schema for basic model", async () => {
      const mockModel: DMMF.Model = {
        name: "User",
        dbName: null,
        fields: [
          createField("id", "String", { isId: true }),
          createField("name", "String"),
          createField("email", "String"),
          createField("age", "Int", { isRequired: false }),
        ],
        uniqueFields: [],
        uniqueIndexes: [],
        primaryKey: null,
      };

      await onGenerate(createTestOptions(createMockDMMF([mockModel])));

      // Verify mkdir was called
      expect(fs.mkdir).toHaveBeenCalledWith("generated", { recursive: true });

      // Verify writeFile was called with correct schema
      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.length).toBe(1);

      const [, contentBuffer] = writeFileCalls[0];
      const content = contentBuffer.toString();

      expect(content).toMatchSnapshot();
    });

    it("should handle enums correctly", async () => {
      const mockEnum: DMMF.DatamodelEnum = {
        name: "Role",
        values: [
          { name: "USER", dbName: null },
          { name: "ADMIN", dbName: null },
        ],
        dbName: null,
      };

      const mockModel: DMMF.Model = {
        name: "User",
        dbName: null,
        fields: [
          createField("id", "String", { isId: true }),
          createField("role", "Role", { kind: "enum" }),
        ],
        uniqueFields: [],
        uniqueIndexes: [],
        primaryKey: null,
      };

      await onGenerate(createTestOptions(createMockDMMF([mockModel], [mockEnum])));

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const content = contentBuffer.toString();

      expect(content).toMatchSnapshot();
    });

    it("should handle relationships correctly", async () => {
      // Create User model with a one-to-many relationship to Post
      const userModel = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
        createField("posts", "Post", {
          kind: "object",
          isList: true,
          relationName: "UserPosts",
          relationToFields: ["id"],
          relationFromFields: ["userId"],
        }),
      ]);

      // Create Post model with both the foreign key and the relation field
      const postModel = createModel("Post", [
        createField("id", "String", { isId: true }),
        createField("title", "String"),
        createField("userId", "String"),
        createField("user", "User", {
          kind: "object",
          relationName: "UserPosts",
          relationFromFields: ["userId"],
          relationToFields: ["id"],
        }),
      ]);

      await onGenerate(createTestOptions(createMockDMMF([userModel, postModel])));

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const content = contentBuffer.toString();

      // Verify the generated code contains the relationship definitions
      expect(content).toMatchSnapshot();
    });
  });

  describe("Schema Version Management", () => {
    it("should increment version when schema hash changes", async () => {
      // First generation with simpler model creation
      const initialModel = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      // Mock initial file read to simulate no existing file
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("File not found"));

      await onGenerate(createTestOptions(createMockDMMF([initialModel])));

      // Get the first generated schema
      const [, firstContentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const firstContent = firstContentBuffer.toString();

      // Second generation with modified model
      const modifiedModel = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
        createField("email", "String"), // Added field
      ]);

      // Mock reading the generated file to be version 1
      vi.mocked(fs.readFile).mockResolvedValueOnce(firstContent);

      await onGenerate(createTestOptions(createMockDMMF([modifiedModel])));

      // Get the content of the last write
      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[1];
      const content = contentBuffer.toString();

      // Version should be incremented
      expect(content).toContain("2,");
    });

    it("should not increment version when schema hash remains the same", async () => {
      const model = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const dmmf = createMockDMMF([model]);

      // Mock reading existing schema with version 1
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        Buffer.from("version: 1\n// Schema hash: abc123")
      );

      await onGenerate(createTestOptions(dmmf));

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[
        vi.mocked(fs.writeFile).mock.calls.length - 1
      ];
      const content = contentBuffer.toString();

      // Version should remain the same
      expect(content).toContain("1,");
    });

    it("should use provided schemaVersion from generator config", async () => {
      const model = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const options = createTestOptions(createMockDMMF([model]));
      // Set the schema version in generator config
      options.generator.config.schemaVersion = "42";

      await onGenerate(options);

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[
        vi.mocked(fs.writeFile).mock.calls.length - 1
      ];
      const content = contentBuffer.toString();

      // Version should match the provided config value
      expect(content).toContain("42,");
    });
  });
});
