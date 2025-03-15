import type { DMMF } from "@prisma/generator-helper";

export type Config = {
  name: string;
  prettier: boolean;
  resolvePrettierConfig: boolean;
  remapTablesToCamelCase: boolean;
};

export type ZeroTypeMapping = {
  type: string;
  isOptional?: boolean;
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
