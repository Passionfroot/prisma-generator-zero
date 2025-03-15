import { describe, it, expect } from "vitest";
import { transformSchema } from "../mappers/schemaMapper";
import { createModel, createField, createMockDMMF } from "./utils";
import type { Config } from "../types";

describe("Schema Mapper", () => {
  describe("remapTablesToCamelCase", () => {
    const baseConfig: Config = {
      name: "test",
      prettier: false,
      resolvePrettierConfig: false,
      remapTablesToCamelCase: false,
    };

    it("should not remap table names when remapTablesToCamelCase is false", () => {
      const model = createModel("UserProfile", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, baseConfig);

      expect(result.models[0].tableName).toBe("UserProfile");
      expect(result.models[0].originalTableName).toBeUndefined();
    });

    it("should remap table names to camel case when remapTablesToCamelCase is true", () => {
      const model = createModel("UserProfile", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("userProfile");
      expect(result.models[0].originalTableName).toBe("UserProfile");
    });

    it("should preserve table name if already in camel case", () => {
      const model = createModel("userProfile", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ]);

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("userProfile");
      expect(result.models[0].originalTableName).toBeUndefined();
    });

    it("should handle table names with underscores", () => {
      const model = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ], {
        dbName: "user_profile"
      });

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("userProfile");
      expect(result.models[0].originalTableName).toBe("user_profile");
    });

    it("should handle table names with multiple underscores", () => {
      const model = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ], {
        dbName: "user_profile_settings"
      });

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("userProfileSettings");
      expect(result.models[0].originalTableName).toBe("user_profile_settings");
    });

    it("should preserve leading underscores", () => {
      const model = createModel("UserProfile", [
        createField("id", "String", { isId: true }),
        createField("name", "String"),
      ], {
        dbName: "_UserProfile"
      });

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("_userProfile");
      expect(result.models[0].originalTableName).toBe("_UserProfile");
    });

    it("should handle implicit many-to-many join tables", () => {
      const postModel = createModel("Post", [
        createField("id", "String", { isId: true }),
        createField("categories", "Category", { 
          isList: true,
          relationName: "PostToCategory",
          kind: "object"
        }),
      ]);

      const categoryModel = createModel("Category", [
        createField("id", "String", { isId: true }),
        createField("posts", "Post", { 
          isList: true,
          relationName: "PostToCategory",
          kind: "object"
        }),
      ]);

      const dmmf = createMockDMMF([postModel, categoryModel]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      // Find the join table (note: the join table name is based on the relation name)
      const joinTable = result.models.find(m => m.modelName === "_PostToCategory");
      expect(joinTable).toBeDefined();
      if (joinTable) {
        expect(joinTable.tableName).toBe("_postToCategory");
        expect(joinTable.originalTableName).toBe("_PostToCategory");
      }
    });
  });
}); 
