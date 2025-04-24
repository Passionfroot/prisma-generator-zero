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
describe("Field Mapping (@map)", () => {
    it("should map field names using @map (dbName)", () => {
      const model = createModel("User", [
        createField("id", "String", { isId: true }),
        createField("firstName", "String", { dbName: "first_name" }),
        createField("emailAddress", "String", { dbName: "email" }),
      ]);

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, baseConfig);

      expect(result.models).toHaveLength(1);
      const userModel = result.models[0];
      expect(userModel.tableName).toBe("User");

      // Access columns as a Record
      const idField = userModel.columns.id;
      expect(idField).toBeDefined();
      expect(idField?.originalColumnName).toBeUndefined();

      const firstNameField = userModel.columns.firstName;
      expect(firstNameField).toBeDefined();
      expect(firstNameField?.originalColumnName).toBe("first_name");

      const emailField = userModel.columns.emailAddress;
      expect(emailField).toBeDefined();
      expect(emailField?.originalColumnName).toBe("email");
    });
  });

  describe("remapColumnsToCamelCase", () => {
    it("should not remap column names when remapColumnsToCamelCase is false", () => {
      const model = createModel("Product", [
        createField("id", "String", { isId: true }),
        createField("product_name", "String"),
        createField("priceAmount", "Float", { dbName: "price_amount" }),
      ]);

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapColumnsToCamelCase: false,
      });

      expect(result.models).toHaveLength(1);
      const productModel = result.models[0];

      const productNameMapping = productModel.columns.product_name;
      expect(productNameMapping).toBeDefined();
      expect(productNameMapping.columnName).toBe("product_name");
      expect(productNameMapping.originalColumnName).toBeUndefined();

      const priceAmountMapping = productModel.columns.priceAmount;
      expect(priceAmountMapping).toBeDefined();
      // When @map exists, columnName (key) is prismaFieldName, originalColumnName (.from) is dbName
      expect(priceAmountMapping.columnName).toBe("priceAmount");
      expect(priceAmountMapping.originalColumnName).toBe("price_amount");
    });

    it("should remap column names to camel case when remapColumnsToCamelCase is true", () => {
      const model = createModel("Product", [
        createField("id", "String", { isId: true }),
        createField("product_name", "String"),
        createField("priceAmount", "Float", { dbName: "price_amount" }),
        createField("alreadyCamel", "String"),
        createField("with_underscore", "String", { dbName: "_internal_code" }),
      ]);

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapColumnsToCamelCase: true,
      });

      expect(result.models).toHaveLength(1);
      const productModel = result.models[0];

      const idMapping = productModel.columns.id;
      expect(idMapping).toBeDefined();
      expect(idMapping.columnName).toBe("id");
      expect(idMapping.originalColumnName).toBeUndefined();

      const productNameMapping = productModel.columns.product_name;
      expect(productNameMapping).toBeDefined();
      // No @map, remap=true, name changes: key=camelCase, from=original
      expect(productNameMapping.columnName).toBe("productName");
      expect(productNameMapping.originalColumnName).toBe("product_name");

      const priceAmountMapping = productModel.columns.priceAmount;
      expect(priceAmountMapping).toBeDefined();
      // Has @map, remap=true: key=prismaName, from=@map value
      expect(priceAmountMapping.columnName).toBe("priceAmount");
      expect(priceAmountMapping.originalColumnName).toBe("price_amount");

      const alreadyCamelMapping = productModel.columns.alreadyCamel;
      expect(alreadyCamelMapping).toBeDefined();
      // No @map, remap=true, name doesn't change: key=original, no from
      expect(alreadyCamelMapping.columnName).toBe("alreadyCamel");
      expect(alreadyCamelMapping.originalColumnName).toBeUndefined();

      const underscoreMapping = productModel.columns.with_underscore;
      expect(underscoreMapping).toBeDefined();
      // Has @map, remap=true: key=prismaName, from=@map value
      expect(underscoreMapping.columnName).toBe("with_underscore");
      expect(underscoreMapping.originalColumnName).toBe("_internal_code");
    });

    // Moved this test case inside the 'remapColumnsToCamelCase' describe block
    it("should remap primary key column names when remapColumnsToCamelCase is true", () => {
      const model = createModel(
        "OrderItem",
        [
          createField("order_id", "String"), // Part 1 of composite PK
          createField("item_number", "Int"), // Part 2 of composite PK
          createField("quantity", "Int"),
        ],
        {
          primaryKey: { name: null, fields: ["order_id", "item_number"] }, // Composite PK
        }
      );

      const dmmf = createMockDMMF([model]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapColumnsToCamelCase: true, // Option is on
      });

      expect(result.models).toHaveLength(1);
      const orderItemModel = result.models[0];

      // Check if columns themselves are remapped
      expect(orderItemModel.columns.order_id.columnName).toBe("orderId");
      expect(orderItemModel.columns.item_number.columnName).toBe("itemNumber");

      // Check if the primaryKey array contains the remapped names
      // This test is expected to FAIL initially based on current implementation analysis
      expect(orderItemModel.primaryKey).toEqual(["orderId", "itemNumber"]);
    });
it("should remap relationship fields (FKs) when remapColumnsToCamelCase is true", () => {
      const authorModel = createModel(
        "Author",
        [
          createField("author_pk", "String", { isId: true }), // Snake case PK
          createField("name", "String"),
          createField("posts", "Post", { isList: true, relationName: "AuthorPosts" }),
        ]
      );
      const postModel = createModel(
        "Post",
        [
          createField("id", "String", { isId: true }),
          createField("title", "String"),
          createField("author_id", "String"), // Snake case FK
          createField("author", "Author", {
            relationName: "AuthorPosts",
            relationFromFields: ["author_id"],
            relationToFields: ["author_pk"],
          }),
        ]
      );

      const dmmf = createMockDMMF([authorModel, postModel]);
      const result = transformSchema(dmmf, {
        ...baseConfig,
        remapColumnsToCamelCase: true, // Option is on
      });

      const transformedAuthor = result.models.find((m) => m.modelName === "Author");
      const transformedPost = result.models.find((m) => m.modelName === "Post");

      expect(transformedAuthor).toBeDefined();
      expect(transformedPost).toBeDefined();

      // Check Post.author relationship (one-to-one from Post perspective)
      const postAuthorRel = transformedPost?.relationships?.author;
      expect(postAuthorRel).toBeDefined();
      if (postAuthorRel && "sourceField" in postAuthorRel && "destField" in postAuthorRel) {
        // sourceField is the FK on Post model (should be remapped)
        expect(postAuthorRel.sourceField).toEqual(["authorId"]);
        // destField is the PK on Author model (should be remapped)
        expect(postAuthorRel.destField).toEqual(["authorPk"]);
      } else {
        expect.fail("Post.author relationship structure is incorrect");
      }

      // Check Author.posts relationship (one-to-many from Author perspective)
      const authorPostsRel = transformedAuthor?.relationships?.posts;
      expect(authorPostsRel).toBeDefined();
      if (authorPostsRel && "sourceField" in authorPostsRel && "destField" in authorPostsRel) {
         // sourceField is the PK on Author model (should be remapped)
        expect(authorPostsRel.sourceField).toEqual(["authorPk"]);
         // destField is the FK on Post model (should be remapped)
        expect(authorPostsRel.destField).toEqual(["authorId"]);
      } else {
        expect.fail("Author.posts relationship structure is incorrect");
      }
    });
  });
});
