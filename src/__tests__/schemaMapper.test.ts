import { describe, it, expect } from "vitest";
import { transformSchema } from "../mappers/schemaMapper";
import { createModel, createField, createMockDMMF } from "./utils";
import type { Config } from "../types";

describe("Schema Mapper", () => {
  const baseConfig: Config = {
    name: "test",
    prettier: false,
    resolvePrettierConfig: false,
    remapTablesToCamelCase: false,
  };

  describe("excludeTables", () => {
    it("should exclude specified tables from the schema", () => {
      const models = [
        createModel("User", [
          createField("id", "String", { isId: true }),
          createField("name", "String"),
        ]),
        createModel("Post", [
          createField("id", "String", { isId: true }),
          createField("title", "String"),
        ]),
        createModel("Comment", [
          createField("id", "String", { isId: true }),
          createField("content", "String"),
        ]),
      ];

      const dmmf = createMockDMMF(models);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        excludeTables: ["Post", "Comment"],
      });

      expect(result.models).toHaveLength(1);
      expect(result.models[0].tableName).toBe("User");
    });

    it("should exclude many-to-many relationships involving excluded tables", () => {
      const models = [
        createModel("User", [
          createField("id", "String", { isId: true }),
          createField("name", "String"),
          createField("posts", "Post", { isList: true, relationName: "UserPosts" }),
        ]),
        createModel("Post", [
          createField("id", "String", { isId: true }),
          createField("title", "String"),
          createField("users", "User", { isList: true, relationName: "UserPosts" }),
        ]),
      ];

      const dmmf = createMockDMMF(models);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        excludeTables: ["Post"],
      });

      expect(result.models).toHaveLength(1);
      expect(result.models[0].tableName).toBe("User");
      // The implicit many-to-many join table should not be included
      expect(result.models.find((m) => m.tableName === "_UserPosts")).toBeUndefined();
    });

    it("should exclude relationship fields from excluded tables", () => {
      const models = [
        createModel("User", [
          createField("id", "String", { isId: true }),
          createField("name", "String"),
          createField("profile", "Profile", { relationName: "UserProfile" }),
          createField("posts", "Post", { relationName: "UserPosts" }),
        ]),
        createModel("Post", [
          createField("id", "String", { isId: true }),
          createField("title", "String"),
          createField("users", "User", { isList: true, relationName: "UserPosts" }),
        ]),
        createModel("Profile", [
          createField("id", "String", { isId: true }),
          createField("bio", "String"),
          createField("user", "User", { relationName: "UserProfile" }),
        ]),
      ];

      const dmmf = createMockDMMF(models);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        excludeTables: ["Post"],
      });

      const userModel = result.models.find((m) => m.tableName === "User");
      expect(userModel).toBeDefined();
      if (userModel) {
        // Verify that the posts relationship field is not included
        expect(userModel.relationships).not.toHaveProperty("posts");
        // Verify that the profile relationship field is still included
        expect(userModel.relationships).toHaveProperty("profile");
      }
    });
  });

  describe("remapTablesToCamelCase", () => {
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
      const model = createModel(
        "User",
        [createField("id", "String", { isId: true }), createField("name", "String")],
        {
          dbName: "user_profile",
        }
      );

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("userProfile");
      expect(result.models[0].originalTableName).toBe("user_profile");
    });

    it("should handle table names with multiple underscores", () => {
      const model = createModel(
        "User",
        [createField("id", "String", { isId: true }), createField("name", "String")],
        {
          dbName: "user_profile_settings",
        }
      );

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      expect(result.models[0].tableName).toBe("userProfileSettings");
      expect(result.models[0].originalTableName).toBe("user_profile_settings");
    });

    it("should preserve leading underscores", () => {
      const model = createModel(
        "UserProfile",
        [createField("id", "String", { isId: true }), createField("name", "String")],
        {
          dbName: "_UserProfile",
        }
      );

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
          kind: "object",
        }),
      ]);

      const categoryModel = createModel("Category", [
        createField("id", "String", { isId: true }),
        createField("posts", "Post", {
          isList: true,
          relationName: "PostToCategory",
          kind: "object",
        }),
      ]);

      const dmmf = createMockDMMF([postModel, categoryModel]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapTablesToCamelCase: true,
      });

      // Find the join table (note: the join table name is based on the relation name)
      const joinTable = result.models.find((m) => m.modelName === "_PostToCategory");
      expect(joinTable).toBeDefined();
      if (joinTable) {
        expect(joinTable.tableName).toBe("_postToCategory");
        expect(joinTable.originalTableName).toBe("_PostToCategory");
      }
    });
  });

  describe("Relationships", () => {
    it("should correctly map one-to-many relationship with composite key on parent", () => {
      const parentModel = createModel(
        "Parent",
        [
          createField("parentId1", "String"),
          createField("parentId2", "String"),
          createField("children", "Child", {
            isList: true,
            relationName: "ParentToChild",
            kind: "object",
          }),
        ],
        {
          primaryKey: {
            name: null,
            fields: ["parentId1", "parentId2"],
          },
        }
      );

      const childModel = createModel("Child", [
        createField("id", "String", { isId: true }),
        createField("parentFk1", "String"),
        createField("parentFk2", "String"),
        createField("parent", "Parent", {
          relationName: "ParentToChild",
          kind: "object",
          relationFromFields: ["parentFk1", "parentFk2"],
          relationToFields: ["parentId1", "parentId2"],
        }),
      ]);

      const dmmf = createMockDMMF([parentModel, childModel]);
      const result = transformSchema(dmmf, baseConfig);

      const transformedParent = result.models.find((m) => m.modelName === "Parent");
      expect(transformedParent).toBeDefined();
      expect(transformedParent?.relationships).toBeDefined();

      const childrenRelationship = transformedParent?.relationships?.children;
      expect(childrenRelationship).toBeDefined();
      expect(childrenRelationship?.type).toBe("many");

      // Check that the relationship is not a chained one and has the expected fields
      if (childrenRelationship && "sourceField" in childrenRelationship && "destField" in childrenRelationship && "destSchema" in childrenRelationship) {
        // Check that the sourceField correctly uses the composite primary key
        expect(childrenRelationship.sourceField).toEqual(["parentId1", "parentId2"]);
        // Check that the destField correctly uses the foreign key fields from the Child model
        expect(childrenRelationship.destField).toEqual(["parentFk1", "parentFk2"]);
        expect(childrenRelationship.destSchema).toBe("childTable");
      } else {
        // Fail the test if the relationship structure is not as expected
        expect(childrenRelationship).toHaveProperty("sourceField");
        expect(childrenRelationship).toHaveProperty("destField");
        expect(childrenRelationship).toHaveProperty("destSchema");
      }
    });
  });
});
