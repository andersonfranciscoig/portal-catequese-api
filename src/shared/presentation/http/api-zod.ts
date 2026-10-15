import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiQuery, type SchemaObject } from "@nestjs/swagger";
import { z, type ZodType } from "zod";

/** Esquema OpenAPI a partir do Zod de entrada (o que o cliente envia). */
function toOpenApiSchema(schema: ZodType): SchemaObject {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "input",
    unrepresentable: "any",
  }) as SchemaObject;
}

export function ApiZodBody(schema: ZodType): MethodDecorator {
  return applyDecorators(ApiBody({ schema: toOpenApiSchema(schema) }));
}

export function ApiZodQuery(schema: ZodType): MethodDecorator {
  const json = toOpenApiSchema(schema);
  const properties = json.properties ?? {};
  const required = new Set(json.required ?? []);

  return applyDecorators(
    ...Object.entries(properties).map(([name, property]) =>
      ApiQuery({
        name,
        required: required.has(name),
        schema: property as SchemaObject,
      }),
    ),
  );
}
