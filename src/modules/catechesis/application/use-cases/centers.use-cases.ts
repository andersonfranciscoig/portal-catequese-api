import type { Clock } from "../../../../shared/domain/clock.js";
import { Center, CenterStatus, type CenterView } from "../../domain/center.js";
import { CenterNotFoundError } from "../../domain/errors/catechesis.errors.js";
import type { CenterRepository } from "../../domain/repositories/catechesis.repositories.js";

/** Centros ativos (qualquer conta autenticada). */
export class ListActiveCentersUseCase {
  constructor(private readonly centers: CenterRepository) {}

  async execute(): Promise<{ items: CenterView[] }> {
    return { items: (await this.centers.list(CenterStatus.ACTIVE)).map((item) => item.toView()) };
  }
}

/** Todos os centros, inclusive inativos (administração). */
export class ListCentersUseCase {
  constructor(private readonly centers: CenterRepository) {}

  async execute(): Promise<{ items: CenterView[] }> {
    return { items: (await this.centers.list()).map((item) => item.toView()) };
  }
}

export class CreateCenterUseCase {
  constructor(
    private readonly centers: CenterRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { name: string; location: string }): Promise<CenterView> {
    const center = Center.create({ ...input, now: this.clock.now() });
    await this.centers.save(center);
    return center.toView();
  }
}

export class UpdateCenterUseCase {
  constructor(
    private readonly centers: CenterRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    id: string;
    name?: string;
    location?: string;
    status?: CenterStatus;
  }): Promise<CenterView> {
    const center = await this.centers.findById(input.id);
    if (!center) throw new CenterNotFoundError();
    const now = this.clock.now();
    if (input.name !== undefined) center.rename(input.name, now);
    if (input.location !== undefined) center.relocate(input.location, now);
    if (input.status !== undefined) center.setStatus(input.status, now);
    await this.centers.save(center);
    return center.toView();
  }
}
