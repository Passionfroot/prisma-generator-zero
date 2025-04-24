import type { DMMF } from "@prisma/generator-helper";

export type Config = {
  name: string;
  prettier: boolean;
  resolvePrettierConfig: boolean;
  remapTablesToCamelCase: boolean;
  excludeTables?: string[];
  enumAsUnion?: boolean;
  remapColumnsToCamelCase?: boolean;
};

// Intermediate type for basic type/optionality mapping
export type ZeroBaseTypeMapping = {
  type: string;
  isOptional?: boolean;
};

export type ZeroTypeMapping = ZeroBaseTypeMapping & {
  columnName: string; // Final column name (potentially remapped)
  originalColumnName?: string; // Original DB column name if @map is used
};
export type ZeroRelationshipLink = {
  sourceField: string[];
  destField: string[];
  destSchema: string;
};

export type ZeroRelationship = {
  type: "one" | "many";
} & (
  | {
      sourceField: string[];
      destField: string[];
      destSchema: string;
    }
  | {
      chain: ZeroRelationshipLink[];
    }
);

export type ZeroModel = {
  tableName: string;
  originalTableName?: string;
  modelName: string;
  zeroTableName: string;
  columns: Record<string, ZeroTypeMapping>;
  relationships?: Record<string, ZeroRelationship>;
  primaryKey: string[];
};

export type TransformedSchema = {
  models: ZeroModel[];
  enums: DMMF.DatamodelEnum[];
};
