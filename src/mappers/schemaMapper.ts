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

function mapRelationships(model: DMMF.Model, dmmf: DMMF.Document): Record<string, ZeroRelationship> | undefined {
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
        const idField = model.fields.find((f) => f.isId)?.name;
        const sourceFields = idField ? [idField] : [];
        const destFields = backReference?.relationFromFields ? 
          ensureStringArray(backReference.relationFromFields) : 
          [];

        relationships[field.name] = {
          sourceField: sourceFields,
          destField: destFields,
          destSchema: getZeroTableName(targetModel.name),
          type: 'many'
        };
      } else {
        // For "one" side relationships
        let sourceFields: string[] = [];
        let destFields: string[] = [];

        if (field.relationFromFields?.length) {
          sourceFields = ensureStringArray(field.relationFromFields);
          destFields = field.relationToFields ? 
            ensureStringArray(field.relationToFields) : 
            [];
        } else if (backReference?.relationFromFields?.length) {
          sourceFields = backReference.relationToFields ? 
            ensureStringArray(backReference.relationToFields) : 
            [];
          destFields = ensureStringArray(backReference.relationFromFields);
        }

        relationships[field.name] = {
          sourceField: sourceFields,
          destField: destFields,
          destSchema: getZeroTableName(targetModel.name),
          type: 'one'
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

  // console.log("model.dbname", model);
  // console.log("getTableName", getTableName(model));

  return {
    tableName: getTableName(model),
    modelName: model.name,
    zeroTableName: getZeroTableName(model.name),
    columns,
    relationships: mapRelationships(model, dmmf),
    primaryKey: ensureStringArray(primaryKey)
  };
}

export function transformSchema(
  dmmf: DMMF.Document,
  currentVersion: number
): TransformedSchema {
  const models = dmmf.datamodel.models.map(model => mapModel(model, dmmf));
  const hash = generateSchemaHash([...dmmf.datamodel.models], [...dmmf.datamodel.enums]);

  return {
    models,
    enums: [...dmmf.datamodel.enums],
    version: currentVersion,
    hash
  };
} 
