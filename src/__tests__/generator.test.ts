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

      const options = createTestOptions(createMockDMMF([mockModel], [mockEnum]));

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

    it("should generate correct schema for model with @map attributes", async () => {
      const messageModel = createModel("message", [
        createField("id", "String", { isId: true, dbName: null }), // No @map
        createField("senderID", "String", {
          isRequired: false,
          dbName: "sender_id", // @map("sender_id")
        }),
        createField("mediumID", "String", {
          isRequired: false,
          dbName: "medium_id", // @map("medium_id")
        }),
      ]);

      await onGenerate(createTestOptions(createMockDMMF([messageModel])));

      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const content = contentBuffer.toString();

      // Verify the output includes .from() calls for mapped columns
      expect(content).toContain("senderID: string().from('sender_id').optional()");
      expect(content).toContain("mediumID: string().from('medium_id').optional()");
      expect(content).toMatchSnapshot(); // Add snapshot assertion for the @map test
    });

    it("should handle model @@map directive correctly", async () => {
      // Define the model with @@map
      const cdrModel = createModel(
        "cdr", // Original Prisma model name
        [createField("id", "String", { isId: true })], // Example field
        { dbName: "xml_cdr" } // Simulates @@map("xml_cdr")
      );

      // Generate options and run generator
      const options = createTestOptions(createMockDMMF([cdrModel]));
      await onGenerate(options);

      // Get generated content
      const [, contentBuffer] = vi.mocked(fs.writeFile).mock.calls[0];
      const content = contentBuffer.toString();

      // Assert against snapshot
      expect(content).toMatchSnapshot();
    });
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
