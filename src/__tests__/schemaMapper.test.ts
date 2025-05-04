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
    remapColumnsToCamelCase: false, // Add default value
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
      if (
        childrenRelationship &&
        "sourceField" in childrenRelationship &&
        "destField" in childrenRelationship &&
        "destSchema" in childrenRelationship
      ) {
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

  it("should correctly map implicit many-to-many relationships with non-string primary keys", () => {
    const postModel = createModel("Post", [
      createField("id", "Int", { isId: true }),
      createField("categories", "Category", {
        isList: true,
        relationName: "PostToCategory",
        kind: "object",
      }),
    ]);

    const categoryModel = createModel("Category", [
      createField("id", "Int", { isId: true }),
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
      expect(joinTable.columns.A.type).toBe("number()");
      expect(joinTable.columns.B.type).toBe("number()");
    }
  });
describe("remapColumnsToCamelCase", () => {
    const configWithRemap: Config = {
      ...baseConfig,
      remapColumnsToCamelCase: true,
    };

    it("should remap column names to camel case", () => {
      const model = createModel("TestModel", [
        createField("id", "String", { isId: true }),
        createField("user_id", "String"),
        createField("created_at", "DateTime"),
      ]);
      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, configWithRemap);
      const transformedModel = result.models[0];

      expect(transformedModel.columns).toHaveProperty("userId");
      expect(transformedModel.columns).toHaveProperty("createdAt");
      expect(transformedModel.columns).not.toHaveProperty("user_id");
      expect(transformedModel.columns).not.toHaveProperty("created_at");
      // Check mappedName is set correctly when remapping occurs without @map
      expect(transformedModel.columns.userId.mappedName).toBe("user_id");
      expect(transformedModel.columns.createdAt.mappedName).toBe("created_at");
    });

    it("should preserve column name if already in camel case", () => {
      const model = createModel("TestModel", [
        createField("id", "String", { isId: true }),
        createField("userId", "String"),
      ]);
      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, configWithRemap);
      const transformedModel = result.models[0];

      expect(transformedModel.columns).toHaveProperty("userId");
      // Check mappedName is undefined when no remapping or @map
      expect(transformedModel.columns.userId.mappedName).toBeUndefined();
    });

    it("should handle column names with leading/multiple underscores", () => {
      const model = createModel("TestModel", [
        createField("id", "String", { isId: true }),
        createField("_internal_field", "String"),
        createField("__private_data", "String"),
      ]);
      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, configWithRemap);
      const transformedModel = result.models[0];

      expect(transformedModel.columns).toHaveProperty("_internalField");
      expect(transformedModel.columns).toHaveProperty("__privateData");
      expect(transformedModel.columns._internalField.mappedName).toBe("_internal_field");
      expect(transformedModel.columns.__privateData.mappedName).toBe("__private_data");
    });

    it("should handle @map attribute correctly when remapping", () => {
      const model = createModel("TestModel", [
        createField("id", "String", { isId: true }),
        createField("user_identifier", "String", { dbName: "user_id_in_db" }), // Prisma name differs from DB name
      ]);
      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, configWithRemap);
      const transformedModel = result.models[0];

      // Key should be camelCase of Prisma name
      expect(transformedModel.columns).toHaveProperty("userIdentifier");
      expect(transformedModel.columns).not.toHaveProperty("user_identifier");
      expect(transformedModel.columns).not.toHaveProperty("userIdInDb");
      // mappedName should be the dbName from @map
      expect(transformedModel.columns.userIdentifier.mappedName).toBe("user_id_in_db");
    });

     it("should handle @map attribute when Prisma name is already camelCase", () => {
      const model = createModel("TestModel", [
        createField("id", "String", { isId: true }),
        createField("userId", "String", { dbName: "user_uuid" }), // Prisma name already camelCase
      ]);
      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, configWithRemap);
      const transformedModel = result.models[0];

      expect(transformedModel.columns).toHaveProperty("userId");
      // mappedName should still be the dbName from @map
      expect(transformedModel.columns.userId.mappedName).toBe("user_uuid");
    });

    it("should remap primary key fields", () => {
      const model = createModel(
        "TestModel",
        [createField("primary_key_part_1", "String"), createField("primary_key_part_2", "String")],
        { primaryKey: { name: null, fields: ["primary_key_part_1", "primary_key_part_2"] } }
      );
      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, configWithRemap);
      const transformedModel = result.models[0];

      // Expect the default change-case behavior with mergeAmbiguousCharacters: true
      expect(transformedModel.primaryKey).toEqual(["primaryKeyPart_1", "primaryKeyPart_2"]);
      expect(transformedModel.columns).toHaveProperty("primaryKeyPart_1");
      expect(transformedModel.columns).toHaveProperty("primaryKeyPart_2");
    });

    it("should remap foreign key fields in relationships (1:N)", () => {
      const userModel = createModel("User", [
        createField("user_id", "String", { isId: true }),
        createField("posts", "Post", { isList: true, relationName: "UserPosts" }),
      ]);
      const postModel = createModel("Post", [
        createField("post_id", "String", { isId: true }),
        createField("author_user_id", "String"), // Foreign key
        createField("author", "User", {
          relationName: "UserPosts",
          relationFromFields: ["author_user_id"],
          relationToFields: ["user_id"],
        }),
      ]);
      const dmmf = createMockDMMF([userModel, postModel]);
      const result = transformSchema(dmmf, configWithRemap);

      const transformedUser = result.models.find(m => m.modelName === "User");
      const transformedPost = result.models.find(m => m.modelName === "Post");

      expect(transformedUser?.columns).toHaveProperty("userId");
      expect(transformedPost?.columns).toHaveProperty("postId");
      expect(transformedPost?.columns).toHaveProperty("authorUserId"); // FK column remapped

      // Check relationship on User side (many)
      const userPostsRel = transformedUser?.relationships?.posts;
      expect(userPostsRel?.type).toBe("many");
      if (userPostsRel && "sourceField" in userPostsRel) {
        expect(userPostsRel.sourceField).toEqual(["userId"]); // Remapped PK
        expect(userPostsRel.destField).toEqual(["authorUserId"]); // Remapped FK
      } else {
        throw new Error("Unexpected relationship structure for User.posts");
      }

      // Check relationship on Post side (one)
      const postAuthorRel = transformedPost?.relationships?.author;
      expect(postAuthorRel?.type).toBe("one");
      if (postAuthorRel && "sourceField" in postAuthorRel) {
        expect(postAuthorRel.sourceField).toEqual(["authorUserId"]); // Remapped FK
        expect(postAuthorRel.destField).toEqual(["userId"]); // Remapped PK
      } else {
        throw new Error("Unexpected relationship structure for Post.author");
      }
    });

     it("should remap fields in implicit M:N join table relationships", () => {
        const postModel = createModel("Post", [
          createField("post_id", "Int", { isId: true }), // Remapped ID
          createField("categories", "Category", {
            isList: true,
            relationName: "PostToCategory",
            kind: "object",
          }),
        ]);

        const categoryModel = createModel("Category", [
          createField("category_id", "Int", { isId: true }), // Remapped ID
          createField("posts", "Post", {
            isList: true,
            relationName: "PostToCategory",
            kind: "object",
          }),
        ]);

        const dmmf = createMockDMMF([postModel, categoryModel]);
        const result = transformSchema(dmmf, configWithRemap);

        const joinTable = result.models.find((m) => m.modelName === "_PostToCategory");
        expect(joinTable).toBeDefined();

        // Check relationships within the join table model
        const relA = joinTable?.relationships?.modelA; // Assuming Category comes first alphabetically
        const relB = joinTable?.relationships?.modelB; // Assuming Post comes second

        expect(relA?.type).toBe("one");
        expect(relB?.type).toBe("one");

        if (relA && "destField" in relA) {
           expect(relA.destField).toEqual(["categoryId"]); // Should point to remapped ID
        } else {
           throw new Error("Unexpected relationship structure for joinTable.modelA");
        }
         if (relB && "destField" in relB) {
           expect(relB.destField).toEqual(["postId"]); // Should point to remapped ID
        } else {
           throw new Error("Unexpected relationship structure for joinTable.modelB");
        }

         // Also check the chained relationships on the original models
         const postCategoriesRel = result.models.find(m => m.modelName === "Post")?.relationships?.categories;
         expect(postCategoriesRel?.type).toBe("many");
         if (postCategoriesRel && "chain" in postCategoriesRel) {
             expect(postCategoriesRel.chain[0].sourceField).toEqual(["postId"]); // Remapped Post ID
             expect(postCategoriesRel.chain[0].destField).toEqual(["B"]); // Join table column
             expect(postCategoriesRel.chain[1].sourceField).toEqual(["A"]); // Join table column
             expect(postCategoriesRel.chain[1].destField).toEqual(["categoryId"]); // Remapped Category ID
         } else {
             throw new Error("Unexpected relationship structure for Post.categories");
         }
     });

  });
});
// End of main describe block
