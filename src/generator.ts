import { GeneratorConfig, generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { version } from "../package.json";
import { Config } from "./types";
import { transformSchema } from "./mappers/schemaMapper";
import { generateCode } from "./generators/codeGenerator";

export async function onGenerate(options: GeneratorOptions) {
  const { generator, dmmf } = options;
  const outputFile = "schema.ts";
  const outputDir = generator.output?.value;

  if (!outputDir) {
    throw new Error("Output directory is required");
  }

  const config = {
    name: generator.name,
    prettier: parseBooleanConfig(generator.config.prettier, false),
    resolvePrettierConfig: parseBooleanConfigDefaultTrue(generator.config.resolvePrettierConfig),
    remapTablesToCamelCase: parseBooleanConfig(generator.config.remapTablesToCamelCase, false),
    remapColumnsToCamelCase: parseBooleanConfig(generator.config.remapColumnsToCamelCase, false),
    excludeTables: loadExcludeTables(generator),
    enumAsUnion: parseBooleanConfig(generator.config.enumAsUnion, false),
  } satisfies Config;

  const transformedSchema = transformSchema(dmmf, config);

  let output = generateCode(transformedSchema, config);

  if (config.prettier) {
    let prettier: typeof import("prettier");
    try {
      prettier = await import("prettier");
    } catch {
      throw new Error("Unable import Prettier. Is it installed?");
    }

    const prettierOptions = config.resolvePrettierConfig
      ? await prettier.resolveConfig(outputFile)
      : null;

    output = await prettier.format(output, { ...prettierOptions, parser: "typescript" });
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, outputFile), output);
}

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "generated/zero",
      prettyName: "Zero Schema",
    };
  },
  onGenerate,
});

/**
 * Load the excludeTables from the generator config
 */
function loadExcludeTables(generator: GeneratorConfig) {
  const value = generator.config.excludeTables;

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("excludeTables must be an array");
  }

  return value;
}
/**
 * Parses a boolean config value from Prisma generator config where the default is false.
 * Handles boolean true, string "true", or returns false otherwise.
 */
function parseBooleanConfig(value: any, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value === true || value === "true";
}

/**
 * Parses a boolean config value where the default is true.
 * Handles boolean false, string "false", or returns true otherwise.
 */
function parseBooleanConfigDefaultTrue(value: any): boolean {
  if (value === undefined) {
    return true;
  }
  return !(value === false || value === "false");
}
