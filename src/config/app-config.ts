import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.string().url(),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres."),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    STORAGE_PROVIDER: z.enum(["uploadthing", "memory"]).default("memory"),
    UPLOADTHING_TOKEN: z.string().optional(),
    /** "private" só no plano pago do UploadThing. */
    UPLOADTHING_ACL: z.enum(["public-read", "private"]).default("public-read"),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(16_777_216).default(5_242_880),
  })
  .refine((env) => env.STORAGE_PROVIDER !== "uploadthing" || Boolean(env.UPLOADTHING_TOKEN), {
    path: ["UPLOADTHING_TOKEN"],
    message: "Defina UPLOADTHING_TOKEN (ou use STORAGE_PROVIDER=memory).",
  });

export class AppConfig {
  readonly env: "development" | "test" | "production";
  readonly port: number;
  readonly databaseUrl: string;
  readonly corsOrigins: string[];
  readonly jwtAccessSecret: string;
  readonly jwtAccessTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  readonly storage: {
    provider: "uploadthing" | "memory";
    uploadthingToken?: string;
    private: boolean;
    maxBytes: number;
  };

  constructor(source: Record<string, string | undefined> = process.env) {
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
      const problems = parsed.error.issues.map(
        (issue) => `- ${issue.path.join(".")}: ${issue.message}`,
      );
      throw new Error(`Configuração inválida:\n${problems.join("\n")}`);
    }
    const env = parsed.data;
    this.env = env.NODE_ENV;
    this.port = env.PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.corsOrigins = env.CORS_ORIGINS;
    this.jwtAccessSecret = env.JWT_ACCESS_SECRET;
    this.jwtAccessTtlSeconds = env.JWT_ACCESS_TTL_SECONDS;
    this.refreshTokenTtlDays = env.REFRESH_TOKEN_TTL_DAYS;
    this.storage = {
      provider: env.STORAGE_PROVIDER,
      uploadthingToken: env.UPLOADTHING_TOKEN,
      private: env.UPLOADTHING_ACL === "private",
      maxBytes: env.UPLOAD_MAX_BYTES,
    };
  }
}
