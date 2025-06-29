import type { DMMF } from "@prisma/generator-helper";
import { ZeroModel, ZeroRelationship, TransformedSchema, Config } from "../types";
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

  // Find the ID fields for modelA and modelB
  const idFieldA = modelA.fields.find((f) => f.isId);
  const idFieldB = modelB.fields.find((f) => f.isId);

  if (!idFieldA) {
    throw new Error(`Implicit relation ${relationName}: Model ${modelA.name} has no @id field.`);
  }
  if (!idFieldB) {
    throw new Error(`Implicit relation ${relationName}: Model ${modelB.name} has no @id field.`);
  }

  // Map the Prisma types of the ID fields to Zero types
  const columnAType = mapPrismaTypeToZero(idFieldA);
  const columnBType = mapPrismaTypeToZero(idFieldB);

  return {
    tableName,
    originalTableName,
    modelName: originalTableName,
    zeroTableName: getZeroTableName(originalTableName),
    columns: {
      A: columnAType,
      B: columnBType,
    },
    relationships: {
      modelA: {
        sourceField: ["A"],
        destField: [idFieldA.name],
        destSchema: getZeroTableName(modelA.name),
        type: "one",
      },
      modelB: {
        sourceField: ["B"],
        destField: [idFieldB.name],
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
  config: Config
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

          // Create a chained relationship through the join table
          relationships[field.name] = {
            type: "many",
            chain: [
              {
                sourceField: [model.fields.find((f) => f.isId)?.name || "id"],
                destField: [isModelA ? "A" : "B"],
                destSchema: getZeroTableName(joinTableName),
              },
              {
                sourceField: [isModelA ? "B" : "A"],
                destField: [targetModel.fields.find((f) => f.isId)?.name || "id"],
                destSchema: getZeroTableName(targetModel.name),
              },
            ],
          };
        } else {
          // Regular one-to-many relationship
          // Use primaryKey fields first (for @@id), fallback to isId field (for @id)
          const idField = model.fields.find((f) => f.isId)?.name;
          const primaryKeyFields = model.primaryKey?.fields || (idField ? [idField] : []);
          const sourceFields = ensureStringArray(primaryKeyFields);
          const destFields = backReference?.relationFromFields
            ? ensureStringArray(backReference.relationFromFields)
            : [];

          relationships[field.name] = {
            sourceField: sourceFields,
            destField: destFields,
            destSchema: getZeroTableName(targetModel.name),
            type: "many",
          };
        }
      } else {
        // For "one" side relationships
        let sourceFields: string[] = [];
        let destFields: string[] = [];

        if (field.relationFromFields?.length) {
          sourceFields = ensureStringArray(field.relationFromFields);
          destFields = field.relationToFields ? ensureStringArray(field.relationToFields) : [];
        } else if (backReference?.relationFromFields?.length) {
          sourceFields = backReference.relationToFields
            ? ensureStringArray(backReference.relationToFields)
            : [];
          destFields = ensureStringArray(backReference.relationFromFields);
        }

        relationships[field.name] = {
          sourceField: sourceFields,
          destField: destFields,
          destSchema: getZeroTableName(targetModel.name),
          type: "one",
        };
      }
    });

  return Object.keys(relationships).length > 0 ? relationships : undefined;
}

function mapModel(model: DMMF.Model, dmmf: DMMF.Document, config: Config): ZeroModel {
  const columns: Record<string, ReturnType<typeof mapPrismaTypeToZero>> = {};

  model.fields
    .filter((field) => !field.relationName)
    .forEach((field) => {
      columns[field.name] = mapPrismaTypeToZero(field);
    });

  const idField = model.fields.find((f) => f.isId)?.name;
  const primaryKey = model.primaryKey?.fields || (idField ? [idField] : []);
  if (!primaryKey[0]) {
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
    relationships: mapRelationships(model, dmmf, config),
    primaryKey: ensureStringArray(primaryKey),
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
