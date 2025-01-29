import type { DMMF } from "@prisma/generator-helper";

export type Config = {
  name: string;
  prettier: boolean;
  resolvePrettierConfig: boolean;
  schemaVersion?: number;
};

export type SchemaVersion = {
  version: number;
  hash: string | null;
};

export type ZeroTypeMapping = {
  type: string;
  isOptional?: boolean;
};

export type ZeroRelationship = {
  sourceField: string[];
  destField: string[];
  destSchema: string;
  type: 'one' | 'many';
};

export type ZeroModel = {
  tableName: string;
  modelName: string;
  zeroTableName: string;
  columns: Record<string, ZeroTypeMapping>;
  relationships?: Record<string, ZeroRelationship>;
  primaryKey: string[];
};

export type TransformedSchema = {
  models: ZeroModel[];
  enums: DMMF.DatamodelEnum[];
  version: number;
  hash: string;
}; 
