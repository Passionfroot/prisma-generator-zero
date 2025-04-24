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

      await onGenerate(
        createTestOptions(createMockDMMF([mockModel], [mockEnum])),
      );

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const content = contentBuffer.toString();

      expect(content).toMatchSnapshot();
    });

    it("should handle enums as unions correctly", async () => {
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

      const options = createTestOptions(
        createMockDMMF([mockModel], [mockEnum]),
      );

      // Set the enumAsUnion configuration option to true
      options.generator.config.enumAsUnion = "true";

      await onGenerate(options);

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
it("should handle column mapping with @map and remapColumnsToCamelCase correctly", async () => {
      const modelWithMappings = createModel("MappedProduct", [
        createField("id", "String", { isId: true }), // No map, no remap needed
        createField("product_code", "String"), // No map, remap needed
        createField("priceAmount", "Float", { dbName: "price_in_db" }), // Map, remap needed (prisma name vs map)
        createField("status", "String", { dbName: "current_status" }), // Map, no remap needed (prisma name vs map)
        createField("alreadyCamel", "String"), // No map, no remap needed
      ]);

      const dmmf = createMockDMMF([modelWithMappings]);

      // --- Test Case 1: remapColumnsToCamelCase = false ---
      const optionsFalse = createTestOptions(dmmf);
      optionsFalse.generator.config.remapColumnsToCamelCase = "false"; // Explicitly false

      await onGenerate(optionsFalse);
      let writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.length).toBe(1);
      let [, contentBufferFalse] = writeFileCalls[0];
      let contentFalse = contentBufferFalse.toString();

      // Assertions for remapColumnsToCamelCase = false
      expect(contentFalse).toContain('id: string()'); // No .from
      expect(contentFalse).toContain('product_code: string()'); // No remap, no .from
      expect(contentFalse).toContain('priceAmount: number().from("price_in_db")'); // Key=prismaName, .from=mapValue
      expect(contentFalse).toContain('status: string().from("current_status")'); // Key=prismaName, .from=mapValue
      expect(contentFalse).toContain('alreadyCamel: string()'); // No .from

      // Clear mocks for the next run
      vi.clearAllMocks();

      // --- Test Case 2: remapColumnsToCamelCase = true ---
      const optionsTrue = createTestOptions(dmmf);
      optionsTrue.generator.config.remapColumnsToCamelCase = "true"; // Explicitly true

      await onGenerate(optionsTrue);
      writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.length).toBe(1);
      let [, contentBufferTrue] = writeFileCalls[0];
      let contentTrue = contentBufferTrue.toString();

      // Assertions for remapColumnsToCamelCase = true
      expect(contentTrue).toContain('id: string()'); // No .from
      expect(contentTrue).toContain('productCode: string().from("product_code")'); // Key=camelCase, .from=original
      expect(contentTrue).toContain('priceAmount: number().from("price_in_db")'); // Key=prismaName, .from=mapValue (map overrides remap)
      expect(contentTrue).toContain('status: string().from("current_status")'); // Key=prismaName, .from=mapValue (map overrides remap)
      expect(contentTrue).toContain('alreadyCamel: string()'); // No .from
    });

  describe("Many-to-Many Relationships", () => {
    it("should generate correct schema for implicit many-to-many relationship", async () => {
      // Create Post model with categories relationship
      const postModel = createModel("Post", [
        createField("id", "Int", { isId: true }),
        createField("title", "String"),
        createField("categories", "Category", {
          isList: true,
          // relationName: "PostToCategory",
          kind: "object",
        }),
      ]);

      // Create Category model with posts relationship
      const categoryModel = createModel("Category", [
        createField("id", "Int", { isId: true }),
        createField("name", "String"),
        createField("posts", "Post", {
          isList: true,
          // relationName: "PostToCategory",
          kind: "object",
        }),
      ]);

      const dmmf = createMockDMMF([postModel, categoryModel]);
      const options = createTestOptions(dmmf);

      // Mock readFile to return null (no existing schema)
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      await onGenerate(options);

      // Get the generated code
      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const generatedCode = writeFileCall[1] as string;

      expect(generatedCode).toMatchSnapshot();
    });

    it("should use custom relation name for implicit many-to-many table", async () => {
      // Create Post model with categories relationship using custom relation name
      const postModel = createModel("Post", [
        createField("id", "Int", { isId: true }),
        createField("title", "String"),
        createField("categories", "Category", {
          isList: true,
          relationName: "MyCustomRelation",
          kind: "object",
        }),
      ]);

      // Create Category model with posts relationship
      const categoryModel = createModel("Category", [
        createField("id", "Int", { isId: true }),
        createField("name", "String"),
        createField("posts", "Post", {
          isList: true,
          relationName: "MyCustomRelation",
          kind: "object",
        }),
      ]);

      const dmmf = createMockDMMF([postModel, categoryModel]);
      const options = createTestOptions(dmmf);

      // Mock readFile to return null (no existing schema)
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      await onGenerate(options);

      // Get the generated code
      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const generatedCode = writeFileCall[1] as string;

      expect(generatedCode).toMatchSnapshot();
    });
  });
});
