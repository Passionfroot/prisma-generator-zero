import type { DMMF } from "@prisma/generator-helper";
import { ZeroModel, ZeroRelationship, TransformedSchema } from "../types";
import { mapPrismaTypeToZero } from "./typeMapper";
import { generateSchemaHash } from "../utils/hash";

function getTableName(model: DMMF.Model): string {
  return model.dbName || model.name;
}

/** Convert model name to camel case
 * Eg. IssueLabel -> issueLabel
 */
function getZeroTableName(str: string): string {
  const firstChar = str.charAt(0);
  const rest = str.slice(1);
  return firstChar.toLowerCase() + rest + "Table";
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

function createImplicitManyToManyModel(
  model1: DMMF.Model,
  model2: DMMF.Model,
  relationName?: string
): ZeroModel {
  const tableName = getImplicitManyToManyTableName(model1.name, model2.name, relationName);
  const [modelA, modelB] = [model1, model2].sort((a, b) => a.name.localeCompare(b.name));

  return {
    tableName,
    modelName: tableName,
    zeroTableName: getZeroTableName(tableName),
    columns: {
      A: {
        type: "string()",
        isOptional: false,
      },
      B: {
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
  dmmf: DMMF.Document
): Record<string, ZeroRelationship> | undefined {
  const relationships: Record<string, ZeroRelationship> = {};

  model.fields
    .filter((field) => field.relationName)
    .forEach((field) => {
      const targetModel = dmmf.datamodel.models.find((m) => m.name === field.type);
      if (!targetModel) {
        throw new Error(`Target model ${field.type} not found for relationship ${field.name}`);
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
          const idField = model.fields.find((f) => f.isId)?.name;
          const sourceFields = idField ? [idField] : [];
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

function mapModel(model: DMMF.Model, dmmf: DMMF.Document): ZeroModel {
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

  return {
    tableName: getTableName(model),
    modelName: model.name,
    zeroTableName: getZeroTableName(model.name),
    columns,
    relationships: mapRelationships(model, dmmf),
    primaryKey: ensureStringArray(primaryKey),
  };
}

export function transformSchema(dmmf: DMMF.Document, currentVersion: number): TransformedSchema {
  const models = dmmf.datamodel.models.map((model) => mapModel(model, dmmf));

  // Add implicit many-to-many join tables
  const implicitJoinTables = dmmf.datamodel.models.flatMap((model) => {
    return model.fields
      .filter((field) => field.relationName && field.isList)
      .map((field) => {
        const targetModel = dmmf.datamodel.models.find((m) => m.name === field.type);
        if (!targetModel) return null;

        const backReference = targetModel.fields.find(
          (f) => f.relationName === field.relationName && f.type === model.name
        );

        if (backReference?.isList) {
          // Only create the join table once for each relationship
          if (model.name.localeCompare(targetModel.name) < 0) {
            return createImplicitManyToManyModel(model, targetModel, field.relationName);
          }
        }
        return null;
      })
      .filter((table): table is ZeroModel => table !== null);
  });

  const hash = generateSchemaHash([...dmmf.datamodel.models], [...dmmf.datamodel.enums]);

  return {
    models: [...models, ...implicitJoinTables],
    enums: [...dmmf.datamodel.enums],
    version: currentVersion,
    hash,
  };
}
