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
  if (field.kind === "enum") {
    return {
      type: `enumeration<${field.type}>()`,
      isOptional: !field.isRequired,
    };
  }

  const baseType = TYPE_MAP[field.type] || "string()";
  return {
    type: baseType,
    isOptional: !field.isRequired,
  };
}
