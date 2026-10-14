# Portal da Catequese — API

API do Portal da Catequese da Paróquia Cristo Rei da Paz.
NestJS + TypeScript, PostgreSQL com Prisma, testes com Vitest.

## Arquitetura

**Monólito modular**: cada módulo de negócio vive em `src/modules/<módulo>` e é
independente dos outros. Se um dia for preciso, um módulo sai para um
microserviço sem reescrever os restantes.

| Módulo     | Responsabilidade                                                                            |
| ---------- | ------------------------------------------------------------------------------------------- |
| `identity` | contas, sessões, permissões, perfil e administração das contas                              |
| `platform` | fase de lançamento (testes / aberto a todos), portal aberto ou encerrado, pedidos de acesso |
| `audit`    | registo de atividade (quem fez o quê e quando)                                              |

```
src/
  config/                 configuração validada no arranque (zod)
  shared/                 núcleo partilhado, sem conhecer nenhum módulo
    domain/               Entity, AggregateRoot, ValueObject, DomainError, Clock…
    application/          UseCase, EventBus (portas)
    infrastructure/       Prisma, event bus em memória
    presentation/http/    filtro de erros de domínio, validação zod, health
  modules/
    identity/
      domain/             agregado Account, Session, objetos de valor, erros,
                          contratos de repositório e de hashing
      application/        casos de uso + portas (tokens)
      infrastructure/     Prisma, bcrypt, JWT, repositórios em memória
      presentation/http/  controller, guards, decorators, esquemas dos pedidos
      testing/            fakes para os testes unitários
      identity.module.ts  liga as peças (o único sítio que conhece o Nest)
      index.ts            API PÚBLICA do módulo
```

Regras (verificadas pelo ESLint em `eslint.config.js`):

- **Camadas** — `domain` e `application` não importam `@nestjs/*`, `@prisma/*`,
  `express`, nem `infrastructure`/`presentation`. A base de dados é um detalhe:
  trocar de base é escrever outra implementação dos repositórios.
- **Fronteiras** — um módulo só importa outro pela sua API pública
  (`modules/<módulo>/index.js`). O `shared` não importa módulos.
- **Dados** — cada módulo tem o seu schema PostgreSQL (`identity`, …) e o seu
  ficheiro em `prisma/schema/`. Nenhum módulo lê tabelas de outro.
- **Comunicação** — entre módulos, por contratos partilhados em
  `shared/application` e por eventos (`EventBus`), hoje em memória; num cenário
  distribuído passa a ser um broker. Exemplos:
  - `LaunchAccessPolicy`: o `identity` pergunta se alguém pode entrar; o
    `platform` responde. O `identity` não depende do `platform`.
  - `ActivityRecorder`: todos registam atividade; o `audit` guarda-a.
  - evento `platform.access_request_approved`: o `identity` dá acesso de testes
    às contas com esse contacto.

## Começar

Requisitos: Node 22.12+ (`nvm use` lê o `.nvmrc`), pnpm, Docker.

```bash
cp .env.example .env          # e troque JWT_ACCESS_SECRET
pnpm install
pnpm db:up                    # PostgreSQL 16 na porta 5433
pnpm db:migrate               # cria as tabelas
pnpm db:seed                  # primeira administração + configuração da plataforma
pnpm start:dev                # http://localhost:3333/api/v1
                              # documentação: http://localhost:3333/docs
```

## Scripts

| Script            | O que faz                                   |
| ----------------- | ------------------------------------------- |
| `pnpm test`       | testes unitários (Vitest)                   |
| `pnpm test:cov`   | testes com cobertura de domínio e aplicação |
| `pnpm check`      | tipos + lint + testes                       |
| `pnpm db:migrate` | cria/aplica migrações em desenvolvimento    |
| `pnpm db:studio`  | explorar a base de dados                    |

## Primeira administração

O `pnpm db:seed` cria a primeira conta de administração geral com os dados de
`SEED_ADMIN_*` do `.env` (o `.env` não vai para o repositório). A palavra-passe
só serve para calcular o hash bcrypt (12 rondas) guardado na base de dados. Se a
conta já existir, o seed garante que é administração ativa e não toca na
palavra-passe.

## API — `/api/v1`

Erros: `{ statusCode, code, message }` com códigos estáveis (ex.:
`identity.beta_access_required`, `identity.account_blocked`,
`identity.portal_closed`).

### Conta (`identity`)

| Método  | Rota                | Descrição                                                              |
| ------- | ------------------- | ---------------------------------------------------------------------- |
| `POST`  | `/auth/register`    | cria a conta e abre a sessão (na fase de testes, só com pedido aceite) |
| `POST`  | `/auth/login`       | telefone **ou** email                                                  |
| `POST`  | `/auth/refresh`     | renova a sessão (rotação do refresh token)                             |
| `POST`  | `/auth/logout`      | termina a sessão deste dispositivo                                     |
| `GET`   | `/auth/me`          | conta autenticada                                                      |
| `PATCH` | `/auth/me`          | altera nome, telefone, email                                           |
| `POST`  | `/auth/me/password` | muda a palavra-passe                                                   |

Regras de entrada: conta bloqueada não entra; portal encerrado → só a
administração; fase de testes → só contas com acesso de testes e a
administração. A renovação da sessão volta a verificar estas regras.

### Plataforma (`platform`)

| Método | Rota                        | Descrição                                             |
| ------ | --------------------------- | ----------------------------------------------------- |
| `GET`  | `/platform/status`          | público: fase de lançamento e portal aberto/encerrado |
| `POST` | `/platform/access-requests` | público: pedir acesso à fase de testes                |

### Administração (permissão `SUPER_ADMIN`)

| Método | Rota                                           | Descrição                                                                            |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/admin/accounts`                              | contas (`search`, `role`, `status`, `access`, `page`, `pageSize`)                    |
| `GET`  | `/admin/accounts/stats`                        | números para a visão geral                                                           |
| `GET`  | `/admin/accounts/:id`                          | uma conta (permissões atribuídas e efetivas)                                         |
| `PUT`  | `/admin/accounts/:id/permissions`              | substitui as permissões                                                              |
| `POST` | `/admin/accounts/:id/block`                    | bloqueia (com motivo) e termina as sessões                                           |
| `POST` | `/admin/accounts/:id/unblock`                  | desbloqueia                                                                          |
| `POST` | `/admin/accounts/:id/catechist-decision`       | aprova/recusa um catequista                                                          |
| `PUT`  | `/admin/accounts/:id/beta-access`              | dá/retira acesso de testes                                                           |
| `GET`  | `/admin/platform/status`                       | estado completo + pedidos por decidir                                                |
| `PUT`  | `/admin/platform/launch`                       | `BETA` ou `PUBLIC` (abrir a todos)                                                   |
| `PUT`  | `/admin/platform/portal`                       | encerrar (aviso, previsão) ou reabrir                                                |
| `GET`  | `/admin/platform/access-requests`              | pedidos (`status`)                                                                   |
| `POST` | `/admin/platform/access-requests/:id/decision` | aceitar/recusar                                                                      |
| `GET`  | `/admin/activity`                              | atividade (`actorId`, `involvingAccountId`, `category`, `search`, `before`, `limit`) |

Permissões: `SUPER_ADMIN` (todas), `COORDINATION`, e — só com a coordenação —
`FINANCE`, `LATE_ENROLLMENT`, `APPROVE_CATECHISTS`. Um catequista por aprovar
não usa permissões. O `PermissionsGuard` confirma-as na base de dados em cada
pedido: uma permissão retirada ou uma conta bloqueada deixam logo de valer.

Salvaguardas: a administração não se pode bloquear nem retirar a si própria, e
há sempre pelo menos uma administração ativa.

Proteger rotas noutro módulo:

```ts
import { AuthGuard, PermissionsGuard, Permission, RequirePermissions } from "../identity/index.js";

@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION, Permission.FINANCE)
@Controller("finance")
export class FinanceController {}
```
