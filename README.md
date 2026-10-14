# Portal da Catequese — API

API do Portal da Catequese da Paróquia Cristo Rei da Paz.
NestJS + TypeScript, PostgreSQL com Prisma, testes com Vitest.

## Arquitetura

**Monólito modular**: cada módulo de negócio vive em `src/modules/<módulo>` e é
independente dos outros. Se um dia for preciso, um módulo sai para um
microserviço sem reescrever os restantes.

| Módulo          | Responsabilidade                                                                            |
| --------------- | ------------------------------------------------------------------------------------------- |
| `identity`      | contas, sessões, permissões, perfil e administração das contas                              |
| `platform`      | fase de lançamento (testes / aberto a todos), portal aberto ou encerrado, pedidos de acesso |
| `audit`         | registo de atividade (quem fez o quê e quando)                                              |
| `notifications` | avisos dentro do portal (o sino) para cada conta                                            |
| `catechesis`    | ano catequético, catequizandos, matrículas, turmas, presenças e avaliações                  |

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
  - `Notifier`: todos notificam; o `notifications` resolve os destinatários
    (contas ou quem tem uma permissão) e guarda os avisos. Uma falha a
    notificar só fica no log: nunca anula a ação.
  - `PeopleDirectory`: o `catechesis` pergunta nomes, contactos e papéis das
    contas; o `identity` responde. Entre esquemas só se guardam ids.
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
| `POST`  | `/auth/me/roles`    | acrescenta um papel à própria conta (catequista fica por aprovar)      |

Papéis: uma conta pode ter vários (`GUARDIAN`, `CATECHUMEN`, `CATECHIST`) — por
exemplo, um catequista que também é encarregado de educação. O papel de
catequista precisa de aprovação.

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
| `PUT`  | `/admin/accounts/:id/roles`                    | define os papéis (catequista acrescentado fica aprovado)                             |
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

### Notificações (`notifications`)

| Método | Rota                         | Descrição                                                        |
| ------ | ---------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/me/notifications`          | as mais recentes e quantas por ler (`unread`, `limit`, `before`) |
| `POST` | `/me/notifications/:id/read` | marca uma como lida                                              |
| `POST` | `/me/notifications/read-all` | marca todas como lidas                                           |

Quem é avisado e quando:

| Acontecimento                                            | Quem recebe                      |
| -------------------------------------------------------- | -------------------------------- |
| Conta nova                                               | administração                    |
| Conta de catequista ou pedido "também sou catequista"    | quem aprova catequistas          |
| Pedido de acesso à fase de testes                        | administração                    |
| Catequista aprovado / recusado / dado pela administração | a pessoa                         |
| Papéis ou acessos alterados, conta desbloqueada          | a pessoa                         |
| Matrícula submetida no portal                            | coordenação                      |
| Matrícula confirmada (com a turma) ou recusada           | encarregado, ou o próprio adulto |
| Turma atribuída ou retirada                              | o catequista                     |
| Falta num encontro (só a primeira vez)                   | encarregado, ou o próprio adulto |

Quem fez a ação nunca é notificado dela.

### Catequese (`catechesis`)

Portal da família — encarregado (educandos menores) ou adulto (o próprio):

| Método | Rota                  | Descrição                                                                        |
| ------ | --------------------- | -------------------------------------------------------------------------------- |
| `GET`  | `/me/family`          | educandos (ou o próprio) com a matrícula e a turma do ano, e todas as matrículas |
| `GET`  | `/me/enrollments`     | todas as matrículas da família                                                   |
| `GET`  | `/me/catechumens/:id` | perfil: matrícula, turma, sacramentos e presenças do ano                         |
| `POST` | `/me/enrollments`     | matrícula (`guardian` presente = educando menor; sem ele = o próprio adulto)     |

Portal do catequista (papel de catequista aprovado), sempre a turma do ano em curso:

| Método | Rota                                   | Descrição                                             |
| ------ | -------------------------------------- | ----------------------------------------------------- |
| `GET`  | `/me/catechist/class`                  | turma, catequizandos e encontros já realizados        |
| `GET`  | `/me/catechist/class/attendance/:date` | chamada de um encontro                                |
| `PUT`  | `/me/catechist/class/attendance/:date` | lança/corrige a chamada (todos os catequizandos)      |
| `GET`  | `/me/catechist/class/evaluations`      | pauta: notas por trimestre, presença, sugestão        |
| `PUT`  | `/me/catechist/class/evaluations`      | guarda notas (0–20) e decisões                        |
| `GET`  | `/me/catechist/class/catechumens/:id`  | ficha: presenças, avaliação e contacto do encarregado |

Coordenação (permissão `COORDINATION`):

| Método | Rota                                     | Descrição                                                |
| ------ | ---------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/coordination/calendar`                 | ano catequético em curso                                 |
| `PUT`  | `/coordination/calendar`                 | define o ano e as datas da catequese                     |
| `GET`  | `/coordination/classes`                  | turmas do ano (catequistas, inscritos, próximo encontro) |
| `POST` | `/coordination/classes`                  | cria uma turma                                           |
| `PUT`  | `/coordination/classes/:id/catechists`   | catequistas da turma (aprovados, um principal)           |
| `GET`  | `/coordination/enrollments`              | matrículas do ano (`status`)                             |
| `POST` | `/coordination/enrollments/:id/decision` | confirma numa turma (mesmo nível, com lugar) ou recusa   |

Regras: uma matrícula por catequizando em cada ano; menores são inscritos pelo
encarregado e adultos (18+) por si; os encontros são semanais (sábado ou
domingo, conforme o período) entre o início e o fim do ano, e só se lançam
presenças de encontros que já aconteceram. O seed cria o ano 2026/2027.

Proteger rotas noutro módulo:

```ts
import { AuthGuard, PermissionsGuard, Permission, RequirePermissions } from "../identity/index.js";

@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION, Permission.FINANCE)
@Controller("finance")
export class FinanceController {}
```
