import type { DMMF } from "@prisma/generator-helper";
import { createHash } from "crypto";

export function generateSchemaHash(models: DMMF.Model[], enums: DMMF.DatamodelEnum[]): string {
  const hash = createHash("sha256");

  // Only hash the structural elements that affect the schema
  const schemaStructure = {
    // Sort models by name for consistency
    models: [...models]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((model) => ({
        name: model.name,
        dbName: model.dbName,
        // Sort fields by name for consistency
        fields: [...model.fields]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => ({
            name: f.name,
            type: f.type,
            isRequired: f.isRequired,
            isList: f.isList,
            relationName: f.relationName,
            relationFromFields: f.relationFromFields ? [...f.relationFromFields].sort() : [],
            relationToFields: f.relationToFields ? [...f.relationToFields].sort() : [],
            default: f.default,
            unique: f.isUnique,
          })),
        primaryKey: model.primaryKey,
        uniqueFields: model.uniqueFields ? [...model.uniqueFields].sort() : [],
        uniqueIndexes: model.uniqueIndexes,
      })),
    // Sort enums by name for consistency
    enums: [...enums]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((enumType) => ({
        name: enumType.name,
        values: [...enumType.values]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((v) => ({
            name: v.name,
            dbName: v.dbName,
          })),
      })),
  };

  hash.update(JSON.stringify(schemaStructure));
  return hash.digest("hex");
}
