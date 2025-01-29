import { describe, it, expect } from "vitest";
import { generateSchemaHash } from "../utils/hash";
import { createField, createModel, createEnum } from "./utils";

describe("Hash Utilities", () => {
  describe("generateSchemaHash", () => {
    it("should generate consistent hash for identical models", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const model2 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash when model structure changes", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const model2 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
        createField("email", "String"), // Added field
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash when field properties change", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String", { isRequired: true }),
      ]);

      const model2 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String", { isRequired: false }), // Changed requirement
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash when enums change", () => {
      const model = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("role", "Role", { kind: "enum" }),
      ]);

      const enum1 = createEnum("Role", ["USER", "ADMIN"]);
      const enum2 = createEnum("Role", ["USER", "ADMIN", "SUPER_ADMIN"]); // Added value

      const hash1 = generateSchemaHash([model], [enum1]);
      const hash2 = generateSchemaHash([model], [enum2]);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash when relationships change", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("posts", "Post", {
          kind: "object",
          isList: true,
          relationName: "UserPosts",
          relationToFields: ["id"],
          relationFromFields: ["userId"],
        }),
      ]);

      const model2 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("posts", "Post", {
          kind: "object",
          isList: true,
          relationName: "UserPosts",
          relationToFields: ["uuid"], // Changed relation field
          relationFromFields: ["userId"],
        }),
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash when model name changes", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const model2 = createModel("Customer", [ // Changed model name
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash when unique constraints change", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("email", "String", { isUnique: false }),
      ]);

      const model2 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("email", "String", { isUnique: true }), // Added unique constraint
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate consistent hash regardless of field order", () => {
      const model1 = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
        createField("email", "String"),
      ]);

      const model2 = createModel("User", [
        createField("email", "String"),
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const hash1 = generateSchemaHash([model1], []);
      const hash2 = generateSchemaHash([model2], []);

      // This might fail if the implementation doesn't sort fields
      // If it fails, we might want to update the implementation to sort fields
      expect(hash1).toBe(hash2);
    });
  });
}); 
