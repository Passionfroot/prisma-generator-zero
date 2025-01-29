import { describe, it, expect } from "vitest";
import { mapPrismaTypeToZero } from "../mappers/typeMapper";
import type { DMMF } from "@prisma/generator-helper";

describe("mapPrismaTypeToZero", () => {
  it("should map basic scalar types correctly", () => {
    const testCases: Array<[DMMF.Field, string]> = [
      [{ type: "String", kind: "scalar", isRequired: true } as DMMF.Field, "string()"],
      [{ type: "Boolean", kind: "scalar", isRequired: true } as DMMF.Field, "boolean()"],
      [{ type: "Int", kind: "scalar", isRequired: true } as DMMF.Field, "number()"],
      [{ type: "Float", kind: "scalar", isRequired: true } as DMMF.Field, "number()"],
      [{ type: "DateTime", kind: "scalar", isRequired: true } as DMMF.Field, "number()"],
      [{ type: "Json", kind: "scalar", isRequired: true } as DMMF.Field, "json()"],
      [{ type: "BigInt", kind: "scalar", isRequired: true } as DMMF.Field, "number()"],
      [{ type: "Decimal", kind: "scalar", isRequired: true } as DMMF.Field, "number()"],
    ];

    testCases.forEach(([field, expectedType]) => {
      const result = mapPrismaTypeToZero(field);
      expect(result.type).toBe(expectedType);
      expect(result.isOptional).toBe(false);
    });
  });

  it("should map enum types correctly", () => {
    const enumField: DMMF.Field = {
      type: "UserRole",
      kind: "enum",
      isRequired: true,
    } as DMMF.Field;

    const result = mapPrismaTypeToZero(enumField);
    expect(result.type).toBe("enumeration<UserRole>()");
    expect(result.isOptional).toBe(false);
  });

  it("should handle optional fields correctly", () => {
    const optionalString: DMMF.Field = {
      type: "String",
      kind: "scalar",
      isRequired: false,
    } as DMMF.Field;

    const optionalEnum: DMMF.Field = {
      type: "UserRole",
      kind: "enum",
      isRequired: false,
    } as DMMF.Field;

    const stringResult = mapPrismaTypeToZero(optionalString);
    expect(stringResult.type).toBe("string()");
    expect(stringResult.isOptional).toBe(true);

    const enumResult = mapPrismaTypeToZero(optionalEnum);
    expect(enumResult.type).toBe("enumeration<UserRole>()");
    expect(enumResult.isOptional).toBe(true);
  });

  it("should default to string() for unknown types", () => {
    const unknownType: DMMF.Field = {
      type: "UnknownType",
      kind: "scalar",
      isRequired: true,
    } as DMMF.Field;

    const result = mapPrismaTypeToZero(unknownType);
    expect(result.type).toBe("string()");
    expect(result.isOptional).toBe(false);
  });
}); 
