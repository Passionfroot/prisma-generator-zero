import type { DMMF } from "@prisma/generator-helper";

export function createField(
  name: string,
  type: string,
  options: Partial<DMMF.Field> = {}
): DMMF.Field {
  return {
    name,
    type,
    kind: "scalar",
    isRequired: true,
    isList: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    isUnique: false,
    hasDefaultValue: false,
    documentation: undefined,
    relationName: undefined,
    relationFromFields: [],
    relationToFields: [],
    ...options,
  };
}

export function createModel(
  name: string,
  fields: DMMF.Field[],
  options: Partial<DMMF.Model> = {}
): DMMF.Model {
  return {
    name,
    dbName: null,
    fields,
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    ...options,
  };
}

export function createEnum(
  name: string,
  values: string[]
): DMMF.DatamodelEnum {
  return {
    name,
    dbName: null,
    values: values.map(v => ({ name: v, dbName: null })),
  };
}

export function createMockDMMF(models: DMMF.Model[], enums: DMMF.DatamodelEnum[] = []): DMMF.Document {
  return {
    datamodel: {
      models,
      enums,
      types: [],
      indexes: [],
    },
    schema: {} as any,
    mappings: {} as any,
  };
} 
