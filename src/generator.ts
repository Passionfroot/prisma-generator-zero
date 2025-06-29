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
    prettier: generator.config.prettier === "true", // Default false,
    resolvePrettierConfig: generator.config.resolvePrettierConfig !== "false", // Default true
    remapTablesToCamelCase: generator.config.remapTablesToCamelCase === "true", // Default false
    excludeTables: loadExcludeTables(generator),
    enumAsUnion: generator.config.enumAsUnion === "true",
  } satisfies Config;

  // Transform the schema
  const transformedSchema = transformSchema(dmmf, config);

  // Generate code
  let output = generateCode(transformedSchema, config);

  // Apply prettier if configured
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

// Use the exported function in the generator handler
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
