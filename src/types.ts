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

export type ZeroBaseTypeMapping = {
  type: string;
  isOptional?: boolean;
};

export type ZeroTypeMapping = ZeroBaseTypeMapping & {
  columnName: string;
  originalColumnName?: string;
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
  typeName: string;
  zeroTableName: string; // Legacy: Original name + "Table" suffix (e.g., issueLabelTable) - Maybe remove later?
  zeroVariableName: string;
  columns: Record<string, ZeroTypeMapping>;
  relationships?: Record<string, ZeroRelationship>;
  primaryKey: string[];
  mapApplied?: boolean;
};

export type TransformedSchema = {
  models: ZeroModel[];
  enums: DMMF.DatamodelEnum[];
};
