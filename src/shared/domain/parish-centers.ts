/** Centros fixos da paróquia (os mesmos ids da migração e do seed). */
export const SEDE_CENTER_ID = "a1000000-0000-4000-8000-000000000001";
export const SANTA_TERESINHA_CENTER_ID = "a1000000-0000-4000-8000-000000000002";
export const SANTO_EXPEDITO_CENTER_ID = "a1000000-0000-4000-8000-000000000003";

export const SEEDED_CENTERS = [
  {
    id: SEDE_CENTER_ID,
    name: "Centro Sede",
    location: "Sede da paróquia",
  },
  {
    id: SANTA_TERESINHA_CENTER_ID,
    name: "Santa Teresinha",
    location: "Santa Teresinha",
  },
  {
    id: SANTO_EXPEDITO_CENTER_ID,
    name: "Santo Expedito",
    location: "Santo Expedito",
  },
] as const;

const names = new Map<string, string>(SEEDED_CENTERS.map((center) => [center.id, center.name]));

/** Guarda o nome para as vistas `{ id, name }` sem ir à base em cada linha. */
export function rememberCenterName(id: string, name: string) {
  names.set(id, name);
}

export function centerRef(id: string): { id: string; name: string } {
  return { id, name: names.get(id) ?? "Centro" };
}
