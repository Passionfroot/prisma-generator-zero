# prisma-generator-zero

`prisma-generator-zero` is a generator for [prisma](https://www.prisma.io) that generates a [Zero](https://zero.rocicorp.dev/) schema from your Prisma schema. This includes schemas of models, enums, and relationships.

## Installation

```bash
npm install @passionfroot/prisma-generator-zero
```

## Usage

Add a new generator to your `prisma.schema`:

```prisma
generator zero {
  provider       = "prisma-generator-zero"
}
```

Then run the following command to generate the `schema.ts` file in the `./generated/zero` output folder:

```sh
npx prisma generate
```


Now import the generated schema into your `schema` file and define your own permissions.

```ts
import { definePermissions } from "@rocicorp/zero";

import { schema as generatedSchema, Schema } from "./prisma/generated/zero/schema";

// The contents of your decoded JWT.
type AuthData = {
  sub: string | null;
};

export const schema = generatedSchema;
export const permissions = definePermissions<ClerkAuthData, Schema>(generatedSchema, () => ({
  // Add your logic here
}));

```
> For more information on `definePermissions` see the [official docs](https://zero.rocicorp.dev/docs/permissions)

You can directly use the generated schema as explained [here](https://zero.rocicorp.dev/docs/zero-schema#building-the-zero-schema) and/or reference specific exports anywhere else in your code.

## Postgres Array Support

Since Zero doesn't natively support Postgres arrays, this generator automatically maps array fields to JSON storage while preserving TypeScript type safety:

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  tags        String[] // Maps to json<string[]>()
  scores      Int[]    // Maps to json<number[]>()
  categories  Category[] // Maps to json<Category[]>() for enum arrays
}

enum Category {
  TECH
  BUSINESS
  LIFESTYLE
}
```

The generated Zero schema will include:

```ts
export const userTable = table("User")
  .columns({
    id: string(),
    email: string(),
    tags: json<string[]>(),
    scores: json<number[]>(),
    categories: json<Category[]>(),
  })
  .primaryKey("id");
```

### Supported Array Types

- **Scalar arrays**: `String[]`, `Int[]`, `Float[]`, `Boolean[]`, `DateTime[]`, `BigInt[]`, `Decimal[]`
- **Enum arrays**: `MyEnum[]`
- **Optional arrays**: `String[]?` → `json<string[]>().optional()`

## Configuration

If you want to customize the behavior of the generator you can use the following options:

```prisma
generator zero {
  // Specify output dir
  output   = "generated/one"
  // When true, the output will be formatted using prettier
  prettier = true
  // When true, the generator will remap table names to camel case using Zero's `.from()` method.
  // You can read more about it here https://zero.rocicorp.dev/docs/zero-schema#name-mapping
  remapTablesToCamelCase = true
  // Optional list of Prisma Model names you want to exclude from the generated schema.
  // Helpful if you want to exclude Views (not supported by Zero) or other tables
  // you don't want Zero client to have access to
  excludeTables = ["Posts", "Comments", ...]
  // Produce union type for Enums instead of TypeScript Enums
  enumAsUnion = true
}
```
