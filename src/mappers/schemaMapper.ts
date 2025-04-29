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
 * Convert a string to camel case, preserving the `_` prefix.
 * Uses default change-case behavior for ambiguous characters (e.g., _1 -> _1).
 */
function toCamelCase(str: string): string {
  const prefixMatch = str.match(/^_+/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  const rest = str.slice(prefix.length);
  // Use default camelCase behavior (no mergeAmbiguousCharacters option)
  return prefix + camelCase(rest);
}

/**
 * Get the table name from a model name
 * If remapTablesToCamelCase is true, convert the table name to camel case
 * Eg. issueLabel -> issueLabel
 */
function getTableName(tableName: string, config: Pick<Config, "remapTablesToCamelCase">): string {
  if (config.remapTablesToCamelCase) {
    return toCamelCase(tableName);
  }
  return tableName;
}

/**
 * Get the column name for the generated schema.
 * If remapColumnsToCamelCase is true, convert the name to camel case.
 */
function getColumnName(fieldName: string, config: Pick<Config, "remapColumnsToCamelCase">): string {
  if (config.remapColumnsToCamelCase) {
    return toCamelCase(fieldName);
  }
  return fieldName;
}

// Accepts the main fieldNameMaps now
function createImplicitManyToManyModel(
  model1: DMMF.Model,
  model2: DMMF.Model,
  relationName: string | undefined,
  config: Config,
  fieldNameMaps: Map<string, Map<string, string>>
): ZeroModel {
  const originalTableName = getImplicitManyToManyTableName(model1.name, model2.name, relationName);
  const [modelA, modelB] = [model1, model2].sort((a, b) => a.name.localeCompare(b.name));

  const tableName = getTableName(originalTableName, config);

  const idFieldA = modelA.fields.find((f: DMMF.Field) => f.isId);
  const idFieldB = modelB.fields.find((f: DMMF.Field) => f.isId);

  if (!idFieldA) { throw new Error(`Implicit relation ${relationName}: Model ${modelA.name} has no @id field.`); }
  if (!idFieldB) { throw new Error(`Implicit relation ${relationName}: Model ${modelB.name} has no @id field.`); }

  const columnAType = mapPrismaTypeToZero(idFieldA);
  const columnBType = mapPrismaTypeToZero(idFieldB);

  const mapA = fieldNameMaps.get(modelA.name) || new Map();
  const mapB = fieldNameMaps.get(modelB.name) || new Map();

  const remappedIdFieldA = mapA.get(idFieldA.name) || idFieldA.name;
  const remappedIdFieldB = mapB.get(idFieldB.name) || idFieldB.name;

  return {
    tableName,
    originalTableName,
    modelName: originalTableName,
    zeroTableName: getZeroTableName(originalTableName),
    columns: { A: columnAType, B: columnBType },
    relationships: {
      modelA: {
        sourceField: ["A"],
        destField: [remappedIdFieldA],
        destSchema: getZeroTableName(modelA.name),
        type: "one",
      },
      modelB: {
        sourceField: ["B"],
        destField: [remappedIdFieldB],
        destSchema: getZeroTableName(modelB.name),
        type: "one",
      },
    },
    primaryKey: ["A", "B"],
  };
}

// Accepts the main fieldNameMaps collection now
function mapRelationships(
  model: DMMF.Model,
  dmmf: DMMF.Document,
  config: Config,
  fieldNameMaps: Map<string, Map<string, string>>
): Record<string, ZeroRelationship> | undefined {
  const relationships: Record<string, ZeroRelationship> = {};

  const remapFields = (fields: string[], modelName: string): string[] => {
      const map = fieldNameMaps.get(modelName) || new Map();
      return fields.map(f => map.get(f) || f);
  };

  model.fields
    .filter((field: DMMF.Field) => field.relationName)
    .forEach((field: DMMF.Field) => {
      const targetModel = dmmf.datamodel.models.find((m: DMMF.Model) => m.name === field.type);
      if (!targetModel) { throw new Error(`Target model ${field.type} not found for relationship ${field.name}`); }
      if (config.excludeTables?.includes(targetModel.name)) { return; }

      const backReference = targetModel.fields.find(
        (f: DMMF.Field) => f.relationName === field.relationName && f.type === model.name
      );

      if (field.isList) { // MANY side
        if (backReference?.isList) { // M:N
          const joinTableName = getImplicitManyToManyTableName(model.name, targetModel.name, field.relationName);
          const [modelA] = [model, targetModel].sort((a, b) => a.name.localeCompare(b.name));
          const isModelA = model.name === modelA.name;

          const sourceIdField = model.fields.find((f: DMMF.Field) => f.isId)?.name || "id";
          const targetIdField = targetModel.fields.find((f: DMMF.Field) => f.isId)?.name || "id";

          const remappedSourceId = (fieldNameMaps.get(model.name) || new Map()).get(sourceIdField) || sourceIdField;
          const remappedTargetId = (fieldNameMaps.get(targetModel.name) || new Map()).get(targetIdField) || targetIdField;

          relationships[field.name] = {
            type: "many",
            chain: [
              {
                sourceField: [remappedSourceId],
                destField: [isModelA ? "A" : "B"],
                destSchema: getZeroTableName(joinTableName),
              },
              {
                sourceField: [isModelA ? "B" : "A"],
                destField: [remappedTargetId],
                destSchema: getZeroTableName(targetModel.name),
              },
            ],
          };
        } else { // 1:N (Current model is Parent, Target is Child)
          const idField = model.fields.find((f: DMMF.Field) => f.isId)?.name;
          const primaryKeyFields = model.primaryKey?.fields || (idField ? [idField] : []);
          const originalSourceFields = ensureStringArray(primaryKeyFields);
          const originalDestFields = backReference?.relationFromFields
            ? ensureStringArray(backReference.relationFromFields)
            : [];

          relationships[field.name] = {
            sourceField: remapFields(originalSourceFields, model.name),
            destField: remapFields(originalDestFields, targetModel.name),
            destSchema: getZeroTableName(targetModel.name),
            type: "many",
          };
        }
      } else { // ONE side (Current model is Child, Target is Parent)
        let originalSourceFields: string[] = [];
        let originalDestFields: string[] = [];

        if (field.relationFromFields?.length) {
          originalSourceFields = ensureStringArray(field.relationFromFields);
          originalDestFields = field.relationToFields ? ensureStringArray(field.relationToFields) : [];
        } else if (backReference?.relationFromFields?.length) {
          originalSourceFields = backReference.relationToFields
            ? ensureStringArray(backReference.relationToFields)
            : [];
          originalDestFields = ensureStringArray(backReference.relationFromFields);
        }

        relationships[field.name] = {
          sourceField: remapFields(originalSourceFields, model.name),
          destField: remapFields(originalDestFields, targetModel.name),
          destSchema: getZeroTableName(targetModel.name),
          type: "one",
        };
      }
    });

  return Object.keys(relationships).length > 0 ? relationships : undefined;
}

// Maps a single model and returns its Zero representation + its field name map
function mapModel(model: DMMF.Model, dmmf: DMMF.Document, config: Config): { zeroModel: ZeroModel, fieldNameMap: Map<string, string> } {
  const columns: Record<string, ReturnType<typeof mapPrismaTypeToZero>> = {};
  const fieldNameMap = new Map<string, string>();

  model.fields
    .filter((field: DMMF.Field) => !field.relationName)
    .filter((field: DMMF.Field) => !field.isList)
    .forEach((field: DMMF.Field) => {
      const originalPrismaName = field.name;
      const databaseName = field.dbName || originalPrismaName;
      const remappedName = getColumnName(originalPrismaName, config);
      const mapping = mapPrismaTypeToZero(field);

      if (remappedName !== databaseName) { mapping.mappedName = databaseName; }
      columns[remappedName] = mapping;
      if (originalPrismaName !== remappedName) { fieldNameMap.set(originalPrismaName, remappedName); }
    });

  const originalIdField = model.fields.find((f: DMMF.Field) => f.isId)?.name;
  const originalPrimaryKeyFields = model.primaryKey?.fields || (originalIdField ? [originalIdField] : []);

  const remappedPrimaryKey = ensureStringArray(originalPrimaryKeyFields).map(
     (pk) => getColumnName(pk, config)
  );

  if (!remappedPrimaryKey[0]) { throw new Error(`No primary key found or mapped for ${model.name}`); }

  const originalTableName = getTableNameFromModel(model);
  const remappedTableName = getTableName(originalTableName, config);
  const shouldRemapTable = config.remapTablesToCamelCase && remappedTableName !== originalTableName;

  const zeroModel: ZeroModel = {
    tableName: remappedTableName,
    originalTableName: shouldRemapTable ? originalTableName : undefined,
    modelName: model.name,
    zeroTableName: getZeroTableName(model.name),
    columns,
    relationships: undefined,
    primaryKey: remappedPrimaryKey,
  };

  return { zeroModel, fieldNameMap };
}

export function transformSchema(
  dmmf: DMMF.Document,
  config: Config
): TransformedSchema {
  const filteredModels = dmmf.datamodel.models.filter((model: DMMF.Model) => {
    return !config.excludeTables?.includes(model.name);
  });

  // Step 1: Map models and collect fieldNameMaps
  const mappedModelData = filteredModels.map((model: DMMF.Model) => mapModel(model, dmmf, config));
  const models: ZeroModel[] = mappedModelData.map((data: { zeroModel: ZeroModel; fieldNameMap: Map<string, string> }) => data.zeroModel);
  const fieldNameMaps = new Map<string, Map<string, string>>(
      filteredModels.map((model: DMMF.Model, i: number) => [model.name, mappedModelData[i].fieldNameMap])
  );

  // Step 2: Map relationships, passing the *entire* fieldNameMaps collection
  models.forEach((zeroModel: ZeroModel) => {
    const originalModel = dmmf.datamodel.models.find((m: DMMF.Model) => m.name === zeroModel.modelName);
    if (originalModel) {
        zeroModel.relationships = mapRelationships(originalModel, dmmf, config, fieldNameMaps);
    }
  });

  // Step 3: Add implicit many-to-many join tables
  const implicitJoinTables = filteredModels.flatMap((model: DMMF.Model) => {
    return model.fields
      .filter((field: DMMF.Field) => field.relationName && field.isList)
      .map((field: DMMF.Field) => {
        const targetModel = dmmf.datamodel.models.find((m: DMMF.Model) => m.name === field.type);
        if (!targetModel) return null;
        if (config.excludeTables?.includes(targetModel.name)) return null;

        const backReference = targetModel.fields.find(
          (f: DMMF.Field) => f.relationName === field.relationName && f.type === model.name
        );

        if (backReference?.isList) {
          if (model.name.localeCompare(targetModel.name) < 0) {
            return createImplicitManyToManyModel(model, targetModel, field.relationName, config, fieldNameMaps);
          }
        }
        return null;
      })
      .filter((table: ZeroModel | null): table is ZeroModel => table !== null);
  });

  return {
    models: [...models, ...implicitJoinTables],
    enums: [...dmmf.datamodel.enums]
  };
}
