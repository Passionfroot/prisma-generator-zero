import type { DMMF } from "@prisma/generator-helper";
import { createHash } from "crypto";

export function generateSchemaHash(models: DMMF.Model[], enums: DMMF.DatamodelEnum[]): string {
  const hash = createHash("sha256");

  // Only hash the structural elements that affect the schema
  const schemaStructure = {
    models: models.map((model) => ({
      name: model.name,
      dbName: model.dbName,
      fields: model.fields.map((f) => ({
        name: f.name,
        type: f.type,
        isRequired: f.isRequired,
        isList: f.isList,
        relationName: f.relationName,
        relationFromFields: f.relationFromFields,
        relationToFields: f.relationToFields,
        default: f.default,
        unique: f.isUnique,
      })),
      primaryKey: model.primaryKey,
      uniqueFields: model.uniqueFields,
      uniqueIndexes: model.uniqueIndexes,
    })),
    enums: enums.map((enumType) => ({
      name: enumType.name,
      values: enumType.values.map((v) => ({
        name: v.name,
        dbName: v.dbName,
      })),
    })),
  };

  hash.update(JSON.stringify(schemaStructure));
  return hash.digest("hex");
} 
