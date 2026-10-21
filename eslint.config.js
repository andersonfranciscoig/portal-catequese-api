// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/** Módulos do monólito. Ao criar um módulo novo, acrescente-o aqui. */
const MODULES = [
  "identity",
  "platform",
  "audit",
  "catechesis",
  "notifications",
  "payments",
  "mail",
];

const LAYERS = "(domain|application|infrastructure|presentation|testing)";

/**
 * Fronteiras: de outro módulo só se importa a API pública (`<módulo>/index.js`),
 * nunca as suas camadas — seja `../../identity/domain/…` ou `modules/identity/…`.
 */
const moduleBoundary = (name) => {
  const others = MODULES.filter((other) => other !== name);
  return {
    regex: others.length ? `(^|/)(${others.join("|")})/${LAYERS}/` : "^$",
    message:
      "Não importe o interior de outro módulo: use a API pública (modules/<módulo>/index.js).",
  };
};

const sharedBoundary = {
  regex: "/modules/",
  message: "O núcleo partilhado não depende de nenhum módulo.",
};

/** Arquitetura limpa: domínio e aplicação sem framework nem base de dados. */
const cleanArchitecture = [
  {
    group: ["@nestjs/*", "@prisma/*", "express"],
    message: "Domínio e aplicação não dependem de frameworks nem da base de dados.",
  },
  {
    regex: "/(infrastructure|presentation)/",
    message: "Domínio e aplicação não dependem da infraestrutura nem da apresentação.",
  },
];

const restrict = (patterns) => ({ "no-restricted-imports": ["error", { patterns }] });
const CORE_LAYERS = "{domain,application}";

export default tseslint.config(
  { ignores: ["dist", "coverage", "src/shared/infrastructure/database/generated"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Com metadados dos decorators, os tipos dos construtores são usados pelo Nest
    // em execução (injeção de dependências): não podem passar a `import type`.
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // (Numa config "flat", a última entrada que define uma regra ganha: por isso
  // as camadas do núcleo repetem as fronteiras e juntam a arquitetura limpa.)
  ...MODULES.flatMap((name) => [
    { files: [`src/modules/${name}/**/*.ts`], rules: restrict([moduleBoundary(name)]) },
    {
      files: [`src/modules/${name}/${CORE_LAYERS}/**/*.ts`],
      ignores: ["**/*.spec.ts"],
      rules: restrict([moduleBoundary(name), ...cleanArchitecture]),
    },
  ]),
  { files: ["src/shared/**/*.ts"], rules: restrict([sharedBoundary]) },
  {
    files: [`src/shared/${CORE_LAYERS}/**/*.ts`],
    rules: restrict([sharedBoundary, ...cleanArchitecture]),
  },
);
