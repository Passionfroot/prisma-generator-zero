import {
  TransformedSchema,
  ZeroModel,
  ZeroTypeMapping,
  ZeroRelationship,
  ZeroRelationshipLink,
  Config,
} from "../types";

function generateImports(): string {
  return `import {
  table,
  string,
  boolean,
  number,
  json,
  enumeration,
  relationships,
  createSchema,
  type Row,
} from "@rocicorp/zero";\n\n`;
}

function generateEnums(schema: TransformedSchema): string {
  if (schema.enums.length === 0) return "";

  let output = "\n";
  schema.enums.forEach((enumType) => {
    output += `export enum ${enumType.name} {\n`;
    enumType.values.forEach((value) => {
      const enumValue = value.dbName || value.name;
      output += `  ${value.name} = "${enumValue}",\n`;
    });
    output += "}\n\n";
  });

  return output;
}

function generateUnionTypes(schema: TransformedSchema): string {
  if (schema.enums.length === 0) return "";

  let output = "\n";
  schema.enums.forEach((enumType) => {
    output += `export type ${enumType.name} = `;

    const values = enumType.values.map(value => {
      const enumValue = value.dbName || value.name;
      return `"${enumValue}"`;
    });

    output += values.join(" | ");
    output += ";\n\n";
  });

  return output;
}

function generateColumnDefinition(name: string, mapping: ZeroTypeMapping): string {
  let typeStr = mapping.isOptional ? `${mapping.type}.optional()` : mapping.type;
  if (mapping.originalColumnName) {
    typeStr += `.from("${mapping.originalColumnName}")`;
  }
  return `    ${mapping.columnName}: ${typeStr}`;
}

function generateModelSchema(model: ZeroModel): string {
  let output = `export const ${model.zeroVariableName} = table("${model.tableName}")`;

  if (model.originalTableName) {
    output += `\n  .from("${model.originalTableName}")`;
  }

  output += "\n  .columns({\n";

  Object.entries(model.columns).forEach(([name, mapping]) => {
    output += generateColumnDefinition(name, mapping) + ",\n";
  });

  output += "  })";

  output += `\n  .primaryKey(${model.primaryKey.map((key) => `"${key}"`).join(", ")});\n\n`;
  return output;
}

function generateRelationshipConfig(rel: ZeroRelationship): string {
  if ("chain" in rel) {
    return rel.chain
      .map(
        (link: ZeroRelationshipLink) => `{
    sourceField: ${JSON.stringify(link.sourceField)},
    destField: ${JSON.stringify(link.destField)},
    destSchema: ${link.destSchema},
  }`
      )
      .join(", ");
  } else {
    return `{
    sourceField: ${JSON.stringify(rel.sourceField)},
    destField: ${JSON.stringify(rel.destField)},
    destSchema: ${rel.destSchema},
  }`;
  }
}

function generateRelationships(models: ZeroModel[]): string {
  const modelRelationships = models.map((model) => {
    if (!model.relationships) return "";

    const relationshipEntries = Object.entries(model.relationships);
    if (relationshipEntries.length === 0) return "";

    const hasOneRelation = relationshipEntries.some(([, rel]) => rel.type === "one");
    const hasManyRelation = relationshipEntries.some(([, rel]) => rel.type === "many");

    const relationshipImports = [];
    if (hasOneRelation) relationshipImports.push("one");
    if (hasManyRelation) relationshipImports.push("many");

    const relationshipsStr = relationshipEntries
      .map(([name, rel]) => {
        const configStr = generateRelationshipConfig(rel);
        return `  ${name}: ${rel.type}(${configStr})`;
      })
      .join(",\n");

    return `export const ${model.zeroVariableName}Relationships = relationships(${model.zeroVariableName}, ({ ${relationshipImports.join(", ")} }) => ({
${relationshipsStr}
}));\n\n`;
  });

  const filteredRelationships = modelRelationships.filter(Boolean);
  return filteredRelationships.length > 0
    ? "\n" + filteredRelationships.join("")
    : "";
}

function generateSchema(schema: TransformedSchema): string {
  let output = "\n";
  output += "export const schema = createSchema(\n";
  output += "  {\n";
  output += "    tables: [\n";
  schema.models.forEach((model) => {
    output += `      ${model.zeroVariableName},\n`;
  });
  output += "    ],\n";

  const hasRelationships = schema.models.some(
    (model) => model.relationships && Object.keys(model.relationships).length > 0
  );

  if (hasRelationships) {
    output += "    relationships: [\n";
    schema.models.forEach((model) => {
      if (model.relationships && Object.keys(model.relationships).length > 0) {
        output += `      ${model.zeroVariableName}Relationships,\n`;
      }
    });
    output += "    ],\n";
  }

  output += "  }\n";
  output += ");\n\n";

  output += "export type Schema = typeof schema;\n";
  schema.models.forEach((model) => {
    output += `export type ${model.typeName} = Row<typeof schema.tables.${model.typeName}>;\n`;
  });

  return output;
}

export function generateCode(
  schema: TransformedSchema,
  config: Config,
): string {
  let output = "\n";

  output += generateImports();

  output += config.enumAsUnion
    ? generateUnionTypes(schema)
    : generateEnums(schema);

  output += "\n";
  schema.models.forEach((model) => {
    output += generateModelSchema(model);
  });

  output += generateRelationships(schema.models);

  output += generateSchema(schema);

  return output;
}
