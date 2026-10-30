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
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres."),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    STORAGE_PROVIDER: z.enum(["uploadthing", "memory"]).default("memory"),
    UPLOADTHING_TOKEN: z.string().optional(),
    /** "private" só no plano pago do UploadThing. */
    UPLOADTHING_ACL: z.enum(["public-read", "private"]).default("public-read"),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(16_777_216).default(5_242_880),
    EMAIL_PROVIDER: z.enum(["brevo", "console"]).default("console"),
    EMAIL_FROM: z.string().email().default("noreply@cristoreidapaz.ao"),
    EMAIL_FROM_NAME: z.string().min(1).default("Portal da Catequese"),
    EMAIL_REPLY_TO: z.string().email().default("catequese@cristoreidapaz.ao"),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_OTP_SECRET: z.string().optional(),
    /** Web Push (gerar com `npx web-push generate-vapid-keys`). Sem chaves: push desligado. */
    VAPID_PUBLIC_KEY: z.string().trim().optional(),
    VAPID_PRIVATE_KEY: z.string().trim().optional(),
    VAPID_SUBJECT: z
      .string()
      .trim()
      .regex(/^(mailto:|https:\/\/)/, "Use mailto:… ou https://…")
      .default("mailto:catequese@cristoreidapaz.ao"),
    /** Alertas de chamada por lançar (verificação de 15 em 15 minutos). */
    ROLL_REMINDERS_ENABLED: z
      .enum(["true", "false"], { message: "Use true ou false." })
      .default("true")
      .transform((value) => value === "true"),
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
  readonly frontendUrl: string;
  readonly jwtAccessSecret: string;
  readonly jwtAccessTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  readonly storage: {
    provider: "uploadthing" | "memory";
    uploadthingToken?: string;
    private: boolean;
    maxBytes: number;
  };
  readonly email: {
    provider: "brevo" | "console";
    from: string;
    fromName: string;
    replyTo: string;
    apiKey?: string;
    otpSecret?: string;
  };
  /** Chaves VAPID do Web Push; `null` quando não estão definidas (push desligado). */
  readonly webPush: { publicKey: string; privateKey: string; subject: string } | null;
  /** Alertas de chamada por lançar; nunca correm nos testes. */
  readonly rollReminders: { enabled: boolean };

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
    this.frontendUrl = env.FRONTEND_URL.replace(/\/$/, "");
    this.jwtAccessSecret = env.JWT_ACCESS_SECRET;
    this.jwtAccessTtlSeconds = env.JWT_ACCESS_TTL_SECONDS;
    this.refreshTokenTtlDays = env.REFRESH_TOKEN_TTL_DAYS;
    this.storage = {
      provider: env.STORAGE_PROVIDER,
      uploadthingToken: env.UPLOADTHING_TOKEN,
      private: env.UPLOADTHING_ACL === "private",
      maxBytes: env.UPLOAD_MAX_BYTES,
    };
    this.email = {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM,
      fromName: env.EMAIL_FROM_NAME,
      replyTo: env.EMAIL_REPLY_TO,
      apiKey: env.EMAIL_API_KEY,
      otpSecret: env.EMAIL_OTP_SECRET,
    };
    this.webPush =
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        : null;
    this.rollReminders = { enabled: env.ROLL_REMINDERS_ENABLED && env.NODE_ENV !== "test" };
  }
}
