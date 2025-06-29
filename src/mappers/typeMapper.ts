import type { DMMF } from "@prisma/generator-helper";
import { ZeroTypeMapping } from "../types";

const TYPE_MAP: Record<string, string> = {
  String: "string()",
  Boolean: "boolean()",
  Int: "number()",
  Float: "number()",
  DateTime: "number()", // Zero uses timestamps
  Json: "json()",
  BigInt: "number()",
  Decimal: "number()",
};

export function mapPrismaTypeToZero(field: DMMF.Field): ZeroTypeMapping {
  const isOptional = !field.isRequired;
  const mappedName = field.dbName && field.dbName !== field.name ? field.dbName : undefined;

  // Handle array types - map them to json() since Zero doesn't support arrays natively
  if (field.isList) {
    // Map Prisma types to TypeScript types for arrays
    const tsTypeMap: Record<string, string> = {
      String: "string[]",
      Boolean: "boolean[]",
      Int: "number[]",
      Float: "number[]",
      DateTime: "number[]",
      Json: "any[]",
      BigInt: "number[]",
      Decimal: "number[]",
    };
    
    const tsType = field.kind === "enum" 
      ? `${field.type}[]` 
      : (tsTypeMap[field.type] || "any[]");
    
    return {
      type: `json<${tsType}>()`,
      isOptional,
      mappedName,
    };
  }

  if (field.kind === "enum") {
    return {
      type: `enumeration<${field.type}>()`,
      isOptional,
      mappedName,
    };
  }

  const baseType = TYPE_MAP[field.type] || "string()";
  return {
    type: baseType,
    isOptional,
    mappedName,
  };
}
