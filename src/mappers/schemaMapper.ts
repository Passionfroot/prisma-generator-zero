import type { DMMF } from "@prisma/generator-helper";
// Add ZeroTypeMapping to the import
import { ZeroModel, ZeroRelationship, TransformedSchema, Config, ZeroTypeMapping } from "../types";
import { mapPrismaTypeToZero } from "./typeMapper";
import { camelCase } from "change-case";

function getTableNameFromModel(model: DMMF.Model): string {
  return model.dbName || model.name;
}

/**
 * Get the zero table name from a model name
 * Eg. IssueLabel -> issueLabelTable
 */
function getZeroTableName(str: string): string {
  const tableName = getTableName(str, { remapTablesToCamelCase: true });
  return tableName + "Table";
}

function ensureStringArray(arr: (string | undefined)[] | readonly string[]): string[] {
  return Array.from(arr).filter((item): item is string => item !== undefined);
}

function getImplicitManyToManyTableName(
  model1: string,
  model2: string,
  relationName?: string
): string {
  if (relationName) {
    return `_${relationName}`;
  }
  const [first, second] = [model1, model2].sort();
  return `_${first}To${second}`;
}

/**
 * Convert a string to camel case, preserving the `_` prefix
 * Eg. _my_table -> _myTable
 */
function toCamelCase(str: string): string {
  const prefixMatch = str.match(/^_+/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  const rest = str.slice(prefix.length);
  return prefix + camelCase(rest);
}

/**
 * Get the table name from a model name
 * If remapTablesToCamelCase is true, convert the table name to camel case
 * Eg. issueLabel -> issueLabel
 */
function getTableName(tableName: string, config?: Pick<Config, "remapTablesToCamelCase">): string {
  if (config?.remapTablesToCamelCase) {
    return toCamelCase(tableName);
  }
  return tableName;
}

function createImplicitManyToManyModel(
  model1: DMMF.Model,
  model2: DMMF.Model,
  relationName?: string,
  config?: Config
): ZeroModel {
  const originalTableName = getImplicitManyToManyTableName(model1.name, model2.name, relationName);
  const [modelA, modelB] = [model1, model2].sort((a, b) => a.name.localeCompare(b.name));

  const tableName = getTableName(originalTableName, config);

  return {
    tableName,
    originalTableName,
    modelName: originalTableName,
    zeroTableName: getZeroTableName(originalTableName),
    columns: {
      A: {
        columnName: "A",
        type: "string()",
        isOptional: false,
      },
      B: {
        columnName: "B",
        type: "string()",
        isOptional: false,
      },
    },
    relationships: {
      modelA: {
        sourceField: ["A"],
        destField: modelA.fields.find((f) => f.isId)?.name
          ? [modelA.fields.find((f) => f.isId)!.name]
          : [],
        destSchema: getZeroTableName(modelA.name),
        type: "one",
      },
      modelB: {
        sourceField: ["B"],
        destField: modelB.fields.find((f) => f.isId)?.name
          ? [modelB.fields.find((f) => f.isId)!.name]
          : [],
        destSchema: getZeroTableName(modelB.name),
        type: "one",
      },
    },
    primaryKey: ["A", "B"],
  };
}

function mapRelationships(
  model: DMMF.Model,
  dmmf: DMMF.Document,
  config: Config,
  columns: Record<string, ReturnType<typeof mapPrismaTypeToZero> & { columnName: string; originalColumnName?: string }>
): Record<string, ZeroRelationship> | undefined {
  const relationships: Record<string, ZeroRelationship> = {};

  model.fields
    .filter((field) => field.relationName)
    .forEach((field) => {
      const targetModel = dmmf.datamodel.models.find((m) => m.name === field.type);
      if (!targetModel) {
        throw new Error(`Target model ${field.type} not found for relationship ${field.name}`);
      }

      // Skip the field if the target model is excluded
      if (config.excludeTables?.includes(targetModel.name)) {
        return;
      }

      const backReference = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.type === model.name
      );

      // Helper to get the final remapped column name from the *current* model's columns
      const getFinalColumnName = (fieldName: string): string => {
        return columns[fieldName]?.columnName || fieldName; // Fallback to original if not found (shouldn't happen for scalar FKs)
      };
      // Helper to get final remapped column names for an array from the *current* model's columns
      const getFinalColumnNames = (fieldNames: string[]): string[] => {
        return fieldNames.map(getFinalColumnName);
      };

      // Helper to compute the final remapped name for a field on a *target* model
      const computeTargetFinalColumnName = (targetModel: DMMF.Model, originalFieldName: string): string => {
        const targetField = targetModel.fields.find(f => f.name === originalFieldName);
        if (!targetField) {
          // This might happen for implicit M2M join table fields ('A', 'B'), handle appropriately if needed
          // Or if the field name is somehow incorrect
          console.warn(`Could not find target field ${originalFieldName} on model ${targetModel.name} for relationship remapping.`);
          return originalFieldName; // Fallback to original name
        }
        const baseName = targetField.dbName || targetField.name;
        return config.remapColumnsToCamelCase ? toCamelCase(baseName) : baseName;
      };
      // Helper for an array of target fields
      const computeTargetFinalColumnNames = (targetModel: DMMF.Model, originalFieldNames: string[]): string[] => {
        return originalFieldNames.map(name => computeTargetFinalColumnName(targetModel, name));
      };


      if (field.isList) {
        // For "many" side relationships
        if (backReference?.isList) {
          // This is a many-to-many relationship
          const joinTableName = getImplicitManyToManyTableName(
            model.name,
            targetModel.name,
            field.relationName
          );
          const [modelA] = [model, targetModel].sort((a, b) => a.name.localeCompare(b.name));
          const isModelA = model.name === modelA.name;

          // Get original ID field names
          const modelOriginalIdField = model.fields.find((f) => f.isId)?.name || "id";
          const targetModelOriginalIdField = targetModel.fields.find((f) => f.isId)?.name || "id";

          // Get potentially remapped ID field names
          // Note: For M2M, the sourceField refers to the *current* model's ID,
          // and the destField in the second chain link refers to the *target* model's ID.
          // We need the *final* column names here.
          // We don't have the target model's columns readily available here,
          // so we might need a different approach or accept a limitation for M2M remapping.
          // For now, let's assume simple ID remapping might work, but this needs review.
          const modelFinalIdName = getFinalColumnName(modelOriginalIdField);
          // Compute target model's final ID name
          const targetModelFinalIdName = computeTargetFinalColumnName(targetModel, targetModelOriginalIdField);

          relationships[field.name] = {
            type: "many",
            chain: [
              {
                sourceField: [modelFinalIdName], // Use remapped name
                destField: [isModelA ? "A" : "B"], // Join table columns are fixed 'A', 'B'
                destSchema: getZeroTableName(joinTableName),
              },
              {
                sourceField: [isModelA ? "B" : "A"], // Join table columns are fixed 'A', 'B'
                destField: [targetModelFinalIdName], // Use computed remapped name from target model
                destSchema: getZeroTableName(targetModel.name),
              },
            ],
          };
        } else {
          // Regular one-to-many relationship
          // Use original primaryKey fields first, fallback to isId field
          const originalIdField = model.fields.find((f) => f.isId)?.name;
          const originalPrimaryKeyFields = model.primaryKey?.fields || (originalIdField ? [originalIdField] : []);
          const originalSourceFields = ensureStringArray(originalPrimaryKeyFields);
          const originalDestFields = backReference?.relationFromFields
            ? ensureStringArray(backReference.relationFromFields)
            : [];

          relationships[field.name] = {
            // Use remapped source field names (from current model's PK)
            sourceField: getFinalColumnNames(originalSourceFields),
             // Compute remapped dest field names (FKs on the target model)
            destField: computeTargetFinalColumnNames(targetModel, originalDestFields),
            destSchema: getZeroTableName(targetModel.name),
            type: "many",
          };
        }
      } else {
        // For "one" side relationships
        let originalSourceFields: string[] = [];
        let originalDestFields: string[] = [];

        if (field.relationFromFields?.length) {
          // field.relationFromFields are the FK fields on *this* model
          originalSourceFields = ensureStringArray(field.relationFromFields);
          // field.relationToFields are the PK fields on the *target* model
          originalDestFields = field.relationToFields ? ensureStringArray(field.relationToFields) : [];
        } else if (backReference?.relationFromFields?.length) {
          // backReference.relationFromFields are the FK fields on the *other* model
          // backReference.relationToFields are the PK fields on *this* model
          originalSourceFields = backReference.relationToFields
            ? ensureStringArray(backReference.relationToFields)
            : [];
          originalDestFields = ensureStringArray(backReference.relationFromFields);
        }

        relationships[field.name] = {
           // Use remapped source field names (FKs on this model)
          sourceField: getFinalColumnNames(originalSourceFields),
           // Compute remapped dest field names (PKs/Unique fields on the target model)
          destField: computeTargetFinalColumnNames(targetModel, originalDestFields),
          destSchema: getZeroTableName(targetModel.name),
          type: "one",
        };
      }
    });

  return Object.keys(relationships).length > 0 ? relationships : undefined;
}

function mapModel(model: DMMF.Model, dmmf: DMMF.Document, config: Config): ZeroModel {
  // Correct type annotation: This record holds the final ZeroTypeMapping objects
  const columns: Record<string, ZeroTypeMapping> = {};

  model.fields
    .filter((field) => !field.relationName)
    // Filter out list fields as Zero doesn't currently support arrays
    // https://zero.rocicorp.dev/docs/postgres-support#column-types
    .filter((field) => !field.isList)
    .forEach((field) => {
      // Get the base type mapping (type, isOptional)
      const baseMapping = mapPrismaTypeToZero(field);
      const originalDbName = field.dbName; // Value from @map
      const prismaFieldName = field.name; // Name in Prisma schema

      let finalSchemaKey: string; // The key used in the generated Zero schema (e.g., 'firstName' or 'wala')
      let nameForFromClause: string | undefined = undefined; // The value for .from()

      if (originalDbName) {
        // Case 1: @map exists (e.g., wala @map("access_control_name"))
        // Schema key is the Prisma field name ('wala')
        // .from() uses the @map value ('access_control_name')
        finalSchemaKey = prismaFieldName;
        nameForFromClause = originalDbName;
      } else {
        // Case 2: No @map (e.g., first_name)
        const potentialCamelCaseName = toCamelCase(prismaFieldName);
        if (config.remapColumnsToCamelCase && potentialCamelCaseName !== prismaFieldName) {
          // Case 2a: No @map, remap=true, and name changes (e.g., first_name -> firstName)
          // Schema key is the camelCase name ('firstName')
          // .from() uses the original Prisma field name ('first_name')
          finalSchemaKey = potentialCamelCaseName;
          nameForFromClause = prismaFieldName;
        } else {
          // Case 2b: No @map, and (remap=false OR name doesn't change) (e.g., firstName -> firstName, or just 'name' with remap=false)
          // Schema key is the original Prisma field name ('first_name' or 'name')
          // No .from() needed
          finalSchemaKey = prismaFieldName;
          nameForFromClause = undefined; // Explicitly undefined
        }
      }

      // Construct the full ZeroTypeMapping object
      const fullMapping: ZeroTypeMapping = {
        ...baseMapping, // Spread the base type and optionality
        columnName: finalSchemaKey, // This is the key for the generated schema object
        ...(nameForFromClause && { originalColumnName: nameForFromClause }) // Add if .from() is needed
      };

      columns[field.name] = fullMapping; // Still use original field name as key in this intermediate map
    });

  // Determine original primary key field names from DMMF
  const originalIdField = model.fields.find((f) => f.isId)?.name;
  const originalPrimaryKeyFields = model.primaryKey?.fields || (originalIdField ? [originalIdField] : []);
  if (!originalPrimaryKeyFields[0]) {
    throw new Error(`No primary key found for ${model.name}`);
  }

  const tableName = getTableNameFromModel(model);
  const camelCasedName = config?.remapTablesToCamelCase ? toCamelCase(tableName) : tableName;

  const shouldRemap = config.remapTablesToCamelCase && camelCasedName !== tableName;

  return {
    tableName: shouldRemap ? camelCasedName : tableName,
    originalTableName: shouldRemap ? tableName : undefined,
    modelName: model.name,
    zeroTableName: getZeroTableName(model.name),
    columns,
    relationships: mapRelationships(model, dmmf, config, columns), // Pass columns for potential FK remapping later
    // Map original PK field names to their final (potentially remapped) column names
    primaryKey: ensureStringArray(originalPrimaryKeyFields).map(originalFieldName => {
      const columnMapping = columns[originalFieldName];
      if (!columnMapping) {
        // This should ideally not happen if the PK field is a scalar type
        throw new Error(`Primary key field ${originalFieldName} not found in mapped columns for model ${model.name}`);
      }
      return columnMapping.columnName; // Use the final columnName
    }),
  };
}

export function transformSchema(
  dmmf: DMMF.Document,
  config: Config
): TransformedSchema {
  // Filter out excluded models
  const filteredModels = dmmf.datamodel.models.filter(model => {
    return !config.excludeTables?.includes(model.name);
  });

  const models = filteredModels.map((model) => mapModel(model, dmmf, config));

  // Add implicit many-to-many join tables (but don't include them in the final schema)
  const implicitJoinTables = filteredModels.flatMap((model) => {
    return model.fields
      .filter((field) => field.relationName && field.isList)
      .map((field) => {
        const targetModel = dmmf.datamodel.models.find((m) => m.name === field.type);
        if (!targetModel) return null;

        // Skip if either model is excluded
        if (config.excludeTables?.includes(targetModel.name)) return null;

        const backReference = targetModel.fields.find(
          (f) => f.relationName === field.relationName && f.type === model.name
        );

        if (backReference?.isList) {
          // Only create the join table once for each relationship
          if (model.name.localeCompare(targetModel.name) < 0) {
            return createImplicitManyToManyModel(model, targetModel, field.relationName, config);
          }
        }
        return null;
      })
      .filter((table): table is ZeroModel => table !== null);
  });

  return {
    models: [...models, ...implicitJoinTables],
    enums: [...dmmf.datamodel.enums]
  };
}
