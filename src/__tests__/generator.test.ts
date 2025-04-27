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

      expect(fs.mkdir).toHaveBeenCalledWith("generated", { recursive: true });

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

      options.generator.config.enumAsUnion = "true";

      await onGenerate(options);

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const content = contentBuffer.toString();

      expect(content).toMatchSnapshot();
    });

    it("should handle relationships correctly", async () => {
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

      expect(content).toMatchSnapshot();
    });
  });

  it("should handle model mapping with @@map correctly", async () => {
    // model cdr @@map("xml_cdr")
    const mappedModel = createModel("cdr", [
      createField("id", "Int", { isId: true }),
      createField("data", "String"),
    ], { dbName: "xml_cdr" });

    const dmmf = createMockDMMF([mappedModel]);
    const options = createTestOptions(dmmf);
    // Assuming default remapTablesToCamelCase = false for this test

    await onGenerate(options);

    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
    expect(writeFileCalls.length).toBe(1);
    const [, contentBuffer] = writeFileCalls[0];
    const content = contentBuffer.toString();

    expect(content).toContain('export const cdrTable = table("cdr")');
    expect(content).toContain('.from("xml_cdr")');
    expect(content).toContain('tables: [\n      cdrTable,\n    ],');
    expect(content).toContain('export type cdr = Row<typeof schema.tables.cdr>;');

    expect(content).toMatchSnapshot("model @@map test");
  });

  it("should handle column mapping with @map and remapColumnsToCamelCase correctly", async () => {
    const modelWithMappings = createModel("MappedProduct", [
      createField("id", "String", { isId: true }),
        createField("product_code", "String"),
        createField("priceAmount", "Float", { dbName: "price_in_db" }),
        createField("status", "String", { dbName: "current_status" }),
        createField("alreadyCamel", "String"),
      ]);

      const dmmf = createMockDMMF([modelWithMappings]);

      // --- Test Case 1: remapColumnsToCamelCase = false ---
      const optionsFalse = createTestOptions(dmmf);
      optionsFalse.generator.config.remapColumnsToCamelCase = "false";

      await onGenerate(optionsFalse);
      let writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.length).toBe(1);
      let [, contentBufferFalse] = writeFileCalls[0];
      let contentFalse = contentBufferFalse.toString();

      expect(contentFalse).toContain('id: string()');
      expect(contentFalse).toContain('product_code: string()');
      expect(contentFalse).toContain('priceAmount: number().from("price_in_db")');
      expect(contentFalse).toContain('status: string().from("current_status")');
      expect(contentFalse).toContain('alreadyCamel: string()');

      vi.clearAllMocks();

      // --- Test Case 2: remapTablesToCamelCase = true (and columns) ---
      const optionsTrue = createTestOptions(dmmf);
      optionsTrue.generator.config.remapTablesToCamelCase = "true";
      optionsTrue.generator.config.remapColumnsToCamelCase = "true";

      await onGenerate(optionsTrue);
      writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.length).toBe(1);
      let [, contentBufferTrue] = writeFileCalls[0];
      let contentTrue = contentBufferTrue.toString();

      expect(contentTrue).toContain('id: string()');
      expect(contentTrue).toContain('productCode: string().from("product_code")');
      expect(contentTrue).toContain('priceAmount: number().from("price_in_db")');
      expect(contentTrue).toContain('status: string().from("current_status")');
      expect(contentTrue).toContain('alreadyCamel: string()');

      expect(contentTrue).toContain('export type mappedProduct = Row<typeof schema.tables.mappedProduct>;');
    });

  describe("Many-to-Many Relationships", () => {
    it("should generate correct schema for implicit many-to-many relationship", async () => {
      const postModel = createModel("Post", [
        createField("id", "Int", { isId: true }),
        createField("title", "String"),
        createField("categories", "Category", {
          isList: true,

          kind: "object",
        }),
      ]);

      const categoryModel = createModel("Category", [
        createField("id", "Int", { isId: true }),
        createField("name", "String"),
        createField("posts", "Post", {
          isList: true,

          kind: "object",
        }),
      ]);

      const dmmf = createMockDMMF([postModel, categoryModel]);
      const options = createTestOptions(dmmf);

      // Mock readFile to return null (no existing schema)
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      await onGenerate(options);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const generatedCode = writeFileCall[1] as string;

      expect(generatedCode).toMatchSnapshot();
    });

    it("should use custom relation name for implicit many-to-many table", async () => {
      const postModel = createModel("Post", [
        createField("id", "Int", { isId: true }),
        createField("title", "String"),
        createField("categories", "Category", {
          isList: true,
          relationName: "MyCustomRelation",
          kind: "object",
        }),
      ]);

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

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const generatedCode = writeFileCall[1] as string;

      expect(generatedCode).toMatchSnapshot();
    });
  });
});
