import type { DMMF } from "@prisma/generator-helper"
import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper"
import { writeFile, mkdir, readFile } from "fs/promises"
import { join } from "path"
import { createHash } from "crypto"

import { version } from "../package.json"

type Config = {
  name: string
  prettier: boolean
  resolvePrettierConfig: boolean
  schemaVersion?: number
  permissionsPath?: string | string[]
}

function mapPrismaTypeToZeroType(field: DMMF.Field): string {
  const typeMap: Record<string, string> = {
    String: "string()",
    Boolean: "boolean()",
    Int: "number()",
    Float: "number()",
    DateTime: "number()", // Zero uses timestamps
    Json: "json()",
    BigInt: "number()",
    Decimal: "number()",
  }

  let output = `${field.name}: `
  if (field.kind === "enum") {
    output += `enumeration<${field.type}>()${field.isRequired ? "" : ".optional()"}`
    return output
  }

  // If it's not an enum, we need to handle required and not required fields differently
  const value = typeMap[field.type] || "string"
  if (field.isRequired) {
    output += `${value}`
  } else {
    output += `${value}.optional()`
  }

  return output
}

function generateRelationships(model: DMMF.Model, dmmf: DMMF.Document) {
  const relationships: string[] = []
  let hasMany = false
  let hasOne = false
  model.fields
    .filter((field) => field.relationName)
    .forEach((field) => {
      const relName = field.name
      let sourceField: string
      let destField: string
      if (field.name === "Comps") {
        console.log(field)
      }
      if (field.isList) {
        // For "many" side relationships, we need to find the matching field in the target model
        // that references back to this model
        const targetModel = dmmf.datamodel.models.find(
          (m) => m.name === field.type,
        )

        const backReference = targetModel?.fields.find(
          (f) => f.relationName === field.relationName && f.type === model.name,
        )
        sourceField = "id"
        destField = backReference?.relationFromFields?.[0] || "id"
        hasMany = true
      } else {
        // For "one" side relationships, use the foreign key
        sourceField = field.relationFromFields?.[0] || "id"
        destField = field.relationToFields?.[0] || "id"
        hasOne = true
      }

      const destModel = field.type

      relationships.push(`
          ${relName}: ${field.isList ? "many" : "one"}({
          sourceField: ['${sourceField}'],
          destField: ['${destField}'],
          destSchema: ${destModel}Schema,
      })`)
    })

  let modelStringStart = ` const ${model.name}Relationships = relationships(${model.name}Schema,({${hasMany ? "many," : ""}${hasOne ? "one" : ""}})=>({`
  let modelStringEnd = `})) ` + `\n\n`

  return modelStringStart + relationships + modelStringEnd
}

function getTableName(model: DMMF.Model) {
  return model.dbName || model.name
}

function generateSchemaHash(
  models: DMMF.Model[],
  enums: DMMF.DatamodelEnum[],
): string {
  const hash = createHash("sha256")

  // Only hash the structural elements that affect the schema
  const schemaStructure = {
    models: models.map((model) => ({
      name: model.name,
      dbName: model.dbName,
      fields: model.fields.map((f) => ({
        // Only include field properties that affect the schema
        name: f.name,
        type: f.type,
        isRequired: f.isRequired,
        isList: f.isList,
        relationName: f.relationName,
        relationFromFields: f.relationFromFields,
        relationToFields: f.relationToFields,
        default: f.default,
        unique: f.isUnique,
      })),
      primaryKey: model.primaryKey,
      uniqueFields: model.uniqueFields,
      uniqueIndexes: model.uniqueIndexes,
    })),
    enums: enums.map((enumType) => ({
      name: enumType.name,
      values: enumType.values.map((v) => ({
        name: v.name,
        dbName: v.dbName,
      })),
    })),
  }

  hash.update(JSON.stringify(schemaStructure))
  return hash.digest("hex")
}

async function getCurrentVersion(
  outputDir: string,
  filename: string,
): Promise<{ version: number; hash: string | null }> {
  try {
    const content = await readFile(join(outputDir, filename), "utf-8")
    const versionMatch = content.match(/version:\s*(\d+)/)
    const hashMatch = content.match(/Schema hash: ([a-f0-9]+)/)

    return {
      version: versionMatch ? parseInt(versionMatch[1], 10) : 0,
      hash: hashMatch ? hashMatch[1] : null,
    }
  } catch {
    return { version: 0, hash: null }
  }
}

// Export the onGenerate function separately
export async function onGenerate(options: GeneratorOptions) {
  const { generator, dmmf } = options
  const outputFile = "schema.ts"
  const outputDir = generator.output?.value

  if (!outputDir) {
    throw new Error("Output directory is required")
  }

  // Generate hash and get current version
  const newHash = generateSchemaHash(
    [...dmmf.datamodel.models],
    [...dmmf.datamodel.enums],
  )
  const { version: currentVersion, hash: currentHash } =
    await getCurrentVersion(outputDir, outputFile)
  const nextAutoincrementVersion =
    currentHash !== newHash ? currentVersion + 1 : currentVersion

  if (
    generator.config.schemaVersion &&
    isNaN(Number(generator.config.schemaVersion))
  ) {
    throw new Error("Schema version must be a number")
  }

  const config = {
    name: generator.name,
    prettier: generator.config.prettier === "true", // Default false,
    resolvePrettierConfig: generator.config.resolvePrettierConfig !== "false", // Default true
    schemaVersion: generator.config.schemaVersion
      ? Number(generator.config.schemaVersion)
      : nextAutoincrementVersion,
    permissionsPath: generator.config.permisionsPath ?? undefined,
  } satisfies Config

  const enums = dmmf.datamodel.enums
  const models = dmmf.datamodel.models
  let output = `// Generated by Zero Schema Generator\n\n`
  output += `import { ${!config.permissionsPath?.length ? "definePermissions," : ""} createSchema, Row, table, string, boolean, number, json, enumeration, relationships } from "@rocicorp/zero";\n\n`

  // Generate enums
  if (enums.length > 0) {
    output += "// Define enums\n\n"
    enums.forEach((enumType) => {
      // Generate TypeScript enum
      output += `export enum ${enumType.name} {\n`
      enumType.values.forEach((value) => {
        // Handle mapped values
        const enumValue = value.dbName || value.name
        output += `  ${value.name} = "${enumValue}",\n`
      })
      output += "}\n\n"
    })
  }

  // Generate schemas for models
  if (models.length > 0) {
    output += "// Define schemas\n\n"
    models.forEach((model) => {
      output += `const ${model.name}Schema = table("${getTableName(model)}")\n`
      output += "  .columns({\n"

      model.fields
        .filter((field) => !field.relationName) // Skip relation fields
        .forEach((field) => {
          const fieldValue = mapPrismaTypeToZeroType(field)
          output += `    ${fieldValue},\n`
        })

      output += "  })\n"

      // Add primary key
      const primaryKey = model.primaryKey?.fields
        ? model.primaryKey.fields
        : model.fields.find((f) => f.isId)?.name

      if (!primaryKey) {
        throw new Error(`No primary key found for ${model.name}`)
      }

      const primaryKeyString = JSON.stringify(primaryKey)

      output += `  .primaryKey(${primaryKeyString})\n\n`
      //   output += "} as const;\n\n"
    })

    models.forEach((model) => {
      // Add relationships if any exist
      const relationships = generateRelationships(model, dmmf)
      if (relationships) {
        // output += "  relationships: {\n"
        output += relationships
        // output += "\n  },\n"
      }
    })
    output += "\n\n"
  }

  output += "// Define schema\n\n"
  // Generate the main schema export
  output += "export const schema = createSchema(\n"
  output += `  ${config.schemaVersion},\n`
  output += "  {\n"
  models.forEach((model) => {
    output += `    ${getTableName(model)}: ${model.name}Schema,\n`
  })
  output += "  },\n"
  output += "  {\n"
  models.forEach((model) => {
    output += `    ${model.name}Relationships,\n`
  })
  output += "  }\n"

  output += ");\n\n"

  // Generate types
  output += "// Define types\n"
  output += "export type Schema = typeof schema;\n"

  models.forEach((model) => {
    output += `export type ${model.name} = Row<typeof schema.tables.${model.name}>;\n`
  })

  // Add permissions
  output += "\n// Define permissions\n"

  if (config.permissionsPath) {
    output +=
      "// Permissions not supplied by default. Edit them in the permissions.ts file\n\n"
    output += `\nexport { permissions } from "${config.permissionsPath}"; \n\n;`
  } else {
    output +=
      "\n// Important: currently no permissions are generated so evey operation is allowed! \n\n"
    output +=
      "\nexport const permissions = definePermissions(schema, () => ({})); \n\n"
  }

  output +=
    "// DO NOT TOUCH THIS. The schema hash is used to determine if the schema has changed and correctly update the version.\n"
  output += "// Schema hash: " + newHash + "\n"

  if (config.prettier) {
    // @ts-ignore
    let prettier: typeof import("prettier")
    try {
      // @ts-ignore
      prettier = await import("prettier")
    } catch {
      throw new Error("Unable import Prettier. Is it installed?")
    }

    const prettierOptions = config.resolvePrettierConfig
      ? await prettier.resolveConfig(outputFile)
      : null

    output = await prettier.format(output, {
      ...prettierOptions,
      parser: "typescript",
    })
  }

  // Ensure output directory exists
  if (outputDir) {
    await mkdir(outputDir, { recursive: true })
  }

  // Write the output to a file
  if (outputDir) {
    await writeFile(join(outputDir, outputFile), output)
  }
}

// Use the exported function in the generator handler
generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "generated/zero",
      prettyName: "Zero Schema",
    }
  },
  onGenerate,
})
