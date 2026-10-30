import { Injectable } from "@nestjs/common";

import {
  CatechesisRelations,
  type CatechesisRelation,
} from "../../../../../shared/application/catechesis-relations.js";
import { PrismaService } from "../../../../../shared/infrastructure/database/prisma.service.js";
import { CatecheticalCalendar } from "../../../domain/catechetical-calendar.js";
import { formatLevel } from "../../../domain/catechesis.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Relações entre contas no ano em curso, a partir das matrículas confirmadas
 * com turma (os mesmos catequizandos que o catequista vê na sua turma).
 */
@Injectable()
export class PrismaCatechesisRelations extends CatechesisRelations {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async relationsOf(accountId: string): Promise<CatechesisRelation[]> {
    if (!UUID.test(accountId)) return [];
    const calendar = await this.prisma.catecheticalCalendar.findUnique({
      where: { id: CatecheticalCalendar.ID.value },
      select: { label: true },
    });
    if (!calendar) return [];
    const year = calendar.label;

    const [asFamily, asCatechist] = await Promise.all([
      // Encarregado ou catequizando com conta: os catequistas das turmas.
      this.prisma.enrollment.findMany({
        where: {
          catecheticalYear: year,
          status: "CONFIRMED",
          classId: { not: null },
          catechumen: { OR: [{ guardianAccountId: accountId }, { accountId }] },
        },
        select: {
          catechumen: {
            select: { fullName: true, birthDate: true, guardianAccountId: true, accountId: true },
          },
          klass: { select: { level: true, catechists: { select: { accountId: true } } } },
        },
      }),
      // Catequista: encarregados e catequizandos (com conta) das suas turmas.
      this.prisma.enrollment.findMany({
        where: {
          catecheticalYear: year,
          status: "CONFIRMED",
          klass: { catechists: { some: { accountId } } },
        },
        select: {
          catechumen: {
            select: { fullName: true, birthDate: true, guardianAccountId: true, accountId: true },
          },
          klass: { select: { level: true } },
        },
      }),
    ]);

    const relations: CatechesisRelation[] = [];
    for (const { catechumen, klass } of asFamily) {
      if (!klass) continue;
      const base = {
        catechumenName: catechumen.fullName,
        catechumenBirthDate: catechumen.birthDate,
        classLabel: formatLevel(klass.level),
      };
      for (const catechist of klass.catechists) {
        if (catechumen.guardianAccountId === accountId) {
          relations.push({
            ...base,
            accountId: catechist.accountId,
            kind: "CATECHIST_OF_MY_CATECHUMEN",
          });
        }
        if (catechumen.accountId === accountId) {
          relations.push({ ...base, accountId: catechist.accountId, kind: "MY_CATECHIST" });
        }
      }
    }
    for (const { catechumen, klass } of asCatechist) {
      if (!klass) continue;
      const base = {
        catechumenName: catechumen.fullName,
        catechumenBirthDate: catechumen.birthDate,
        classLabel: formatLevel(klass.level),
      };
      if (catechumen.guardianAccountId) {
        relations.push({
          ...base,
          accountId: catechumen.guardianAccountId,
          kind: "GUARDIAN_IN_MY_CLASS",
        });
      }
      if (catechumen.accountId) {
        relations.push({
          ...base,
          accountId: catechumen.accountId,
          kind: "CATECHUMEN_IN_MY_CLASS",
        });
      }
    }
    return relations.filter((relation) => relation.accountId !== accountId);
  }
}
