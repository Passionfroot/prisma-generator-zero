import type { DMMF } from "@prisma/generator-helper";
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
  return `${tableName}Table`;
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
// Note: This function seems unused now that logic is within mapModel. Consider removing later.
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
  const originalJoinTableName = getImplicitManyToManyTableName(model1.name, model2.name, relationName);
  const [modelA, modelB] = [model1, model2].sort((a, b) => a.name.localeCompare(b.name));

  const finalTableName = config?.remapTablesToCamelCase ? toCamelCase(originalJoinTableName) : originalJoinTableName;
  const variableName = finalTableName + "Table";

  return {
    tableName: finalTableName,
    originalTableName: finalTableName !== originalJoinTableName ? originalJoinTableName : undefined,
    modelName: originalJoinTableName,
    zeroTableName: getZeroTableName(originalJoinTableName),
    zeroVariableName: variableName,
    typeName: finalTableName,
    mapApplied: false,
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

      if (config.excludeTables?.includes(targetModel.name)) {
        return;
      }

      const backReference = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.type === model.name
      );

      const getFinalColumnName = (fieldName: string): string => {
        return columns[fieldName]?.columnName || fieldName;
      };
      const getFinalColumnNames = (fieldNames: string[]): string[] => {
        return fieldNames.map(getFinalColumnName);
      };

      const computeTargetFinalColumnName = (targetModel: DMMF.Model, originalFieldName: string): string => {
        const targetField = targetModel.fields.find(f => f.name === originalFieldName);
        if (!targetField) {
          console.warn(`Could not find target field ${originalFieldName} on model ${targetModel.name} for relationship remapping.`);
          return originalFieldName;
        }
        const baseName = targetField.dbName || targetField.name;
        return config.remapColumnsToCamelCase ? toCamelCase(baseName) : baseName;
      };
      const computeTargetFinalColumnNames = (targetModel: DMMF.Model, originalFieldNames: string[]): string[] => {
        return originalFieldNames.map(name => computeTargetFinalColumnName(targetModel, name));
      };


      if (field.isList) {
        if (backReference?.isList) {
          const joinTableName = getImplicitManyToManyTableName(
            model.name,
            targetModel.name,
            field.relationName
          );
          const [modelA] = [model, targetModel].sort((a, b) => a.name.localeCompare(b.name));
          const isModelA = model.name === modelA.name;

          const modelOriginalIdField = model.fields.find((f) => f.isId)?.name || "id";
          const targetModelOriginalIdField = targetModel.fields.find((f) => f.isId)?.name || "id";

          const modelFinalIdName = getFinalColumnName(modelOriginalIdField);
          const targetModelFinalIdName = computeTargetFinalColumnName(targetModel, targetModelOriginalIdField);

          const joinTableMapApplied = !!(dmmf.datamodel.models.find(m => m.name === joinTableName)?.dbName);
          const joinTableNameBase = joinTableMapApplied ? joinTableName : (config?.remapTablesToCamelCase ? toCamelCase(joinTableName) : joinTableName);
          const joinTableZeroVariableName = joinTableNameBase + "Table";

          const targetMapApplied = !!(targetModel.dbName && targetModel.dbName !== targetModel.name);
          const targetModelNameBase = targetMapApplied ? targetModel.name : (config?.remapTablesToCamelCase ? toCamelCase(targetModel.name) : targetModel.name);
          const targetZeroVariableName = targetModelNameBase + "Table";


          relationships[field.name] = {
            type: "many",
            chain: [
              {
                sourceField: [modelFinalIdName],
                destField: [isModelA ? "A" : "B"],
                destSchema: joinTableZeroVariableName,
              },
              {
                sourceField: [isModelA ? "B" : "A"],
                destField: [targetModelFinalIdName],
                destSchema: targetZeroVariableName,
              },
            ],
          };
        } else {
          const originalIdField = model.fields.find((f) => f.isId)?.name;
          const originalPrimaryKeyFields = model.primaryKey?.fields || (originalIdField ? [originalIdField] : []);
          const originalSourceFields = ensureStringArray(originalPrimaryKeyFields);
          const originalDestFields = backReference?.relationFromFields
            ? ensureStringArray(backReference.relationFromFields)
            : [];

          const targetMapApplied = !!(targetModel.dbName && targetModel.dbName !== targetModel.name);
          const targetModelNameBase = targetMapApplied ? targetModel.name : (config?.remapTablesToCamelCase ? toCamelCase(targetModel.name) : targetModel.name);
          const targetZeroVariableName = targetModelNameBase + "Table";

          relationships[field.name] = {
            sourceField: getFinalColumnNames(originalSourceFields),
            destField: computeTargetFinalColumnNames(targetModel, originalDestFields),
            destSchema: targetZeroVariableName,
            type: "many",
          };
        }
      } else {
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

        const targetMapApplied = !!(targetModel.dbName && targetModel.dbName !== targetModel.name);
        const targetModelNameBase = targetMapApplied ? targetModel.name : (config?.remapTablesToCamelCase ? toCamelCase(targetModel.name) : targetModel.name);
        const targetZeroVariableName = targetModelNameBase + "Table";

        relationships[field.name] = {
          sourceField: getFinalColumnNames(originalSourceFields),
          destField: computeTargetFinalColumnNames(targetModel, originalDestFields),
          destSchema: targetZeroVariableName,
          type: "one",
        };
      }
    }); // Add missing closing }); for forEach

    return Object.keys(relationships).length > 0 ? relationships : undefined;
  }

  function mapModel(model: DMMF.Model, dmmf: DMMF.Document, config: Config): ZeroModel {
    const columns: Record<string, ZeroTypeMapping> = {};

    model.fields
      .filter((field) => !field.relationName)
      .filter((field) => !field.isList)
      .forEach((field) => {
        const baseMapping = mapPrismaTypeToZero(field);
        const originalDbName = field.dbName;
        const prismaFieldName = field.name;

        let finalSchemaKey: string;
        let nameForFromClause: string | undefined = undefined;

        if (originalDbName) {
          finalSchemaKey = prismaFieldName;
          nameForFromClause = originalDbName;
        } else {
          const potentialCamelCaseName = toCamelCase(prismaFieldName);
          if (config.remapColumnsToCamelCase && potentialCamelCaseName !== prismaFieldName) {
            finalSchemaKey = potentialCamelCaseName;
            nameForFromClause = prismaFieldName;
          } else {
            finalSchemaKey = prismaFieldName;
            nameForFromClause = undefined;
          }
        }

        const fullMapping: ZeroTypeMapping = {
          ...baseMapping,
          columnName: finalSchemaKey,
          ...(nameForFromClause && { originalColumnName: nameForFromClause })
        };

        columns[field.name] = fullMapping;
      });

    const originalIdField = model.fields.find((f) => f.isId)?.name;
    const originalPrimaryKeyFields = model.primaryKey?.fields || (originalIdField ? [originalIdField] : []);
    if (!originalPrimaryKeyFields[0]) {
    throw new Error(`No primary key found for ${model.name}`);
  }

  const mapApplied = !!(model.dbName && model.dbName !== model.name);

  const tableName = mapApplied ? model.name : (config?.remapTablesToCamelCase ? toCamelCase(model.name) : model.name);

  const variableNameBase = mapApplied ? model.name : (config?.remapTablesToCamelCase ? toCamelCase(model.name) : model.name);
  const finalVariableName = variableNameBase + "Table";

  const typeName = mapApplied ? model.name : (config?.remapTablesToCamelCase ? toCamelCase(model.name) : model.name);

  let originalTableNameForFrom: string | undefined = undefined;
  if (mapApplied) {
      originalTableNameForFrom = model.dbName;
  } else if (config?.remapTablesToCamelCase) {
      const potentialCamelCaseName = toCamelCase(model.name);
      if (potentialCamelCaseName !== model.name) {
          originalTableNameForFrom = model.name;
      }
  }

  return {
    tableName: tableName,
    originalTableName: originalTableNameForFrom,
    modelName: model.name,
    typeName: typeName,
    zeroTableName: getZeroTableName(model.name), // Legacy - Remove later?
    zeroVariableName: finalVariableName,
    mapApplied: mapApplied,
    columns,
    relationships: mapRelationships(model, dmmf, config, columns),
    primaryKey: ensureStringArray(originalPrimaryKeyFields).map(originalFieldName => {
      const columnMapping = columns[originalFieldName];
      if (!columnMapping) {
        throw new Error(`Primary key field ${originalFieldName} not found in mapped columns for model ${model.name}`);
      }
      return columnMapping.columnName;
    }),
  };
} // Closing brace for mapModel function

export function transformSchema(
dmmf: DMMF.Document,
config: Config
): TransformedSchema {
const filteredModels = dmmf.datamodel.models.filter(model => {
  return !config.excludeTables?.includes(model.name);
});

const models = filteredModels.map((model) => mapModel(model, dmmf, config));

const implicitJoinTables = filteredModels.flatMap((model) => {
  return model.fields
    .filter((field) => field.relationName && field.isList)
    .map((field) => {
      const targetModel = dmmf.datamodel.models.find((m) => m.name === field.type);
      if (!targetModel) return null;

      if (config.excludeTables?.includes(targetModel.name)) return null;

      const backReference = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.type === model.name
      );

      if (backReference?.isList) {
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
  enums: [...dmmf.datamodel.enums] // Add missing enums property
};
} // Add missing closing brace for transformSchema
