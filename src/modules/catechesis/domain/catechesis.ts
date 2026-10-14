/** Vocabulário da catequese (o mesmo do portal). */

type ValueOf<T> = T[keyof T];

/** Percurso: Batismo → Comunhão → Bíblico → Crisma. */
export const CatechesisLevel = {
  BAPTISM_PRE: "BAPTISM_PRE",
  BAPTISM_1: "BAPTISM_1",
  BAPTISM_2: "BAPTISM_2",
  BAPTISM_3: "BAPTISM_3",
  COMMUNION_PRE: "COMMUNION_PRE",
  COMMUNION_1: "COMMUNION_1",
  COMMUNION_2: "COMMUNION_2",
  COMMUNION_3: "COMMUNION_3",
  BIBLICAL: "BIBLICAL",
  CONFIRMATION_1: "CONFIRMATION_1",
  CONFIRMATION_2: "CONFIRMATION_2",
  CONFIRMATION_3: "CONFIRMATION_3",
} as const;
export type CatechesisLevel = ValueOf<typeof CatechesisLevel>;

/** Sábado de manhã (crianças), sábado à tarde (15+), domingo depois da missa das 7h. */
export const SessionSlot = {
  SATURDAY_MORNING: "SATURDAY_MORNING",
  SATURDAY_AFTERNOON: "SATURDAY_AFTERNOON",
  SUNDAY_AFTER_MASS: "SUNDAY_AFTER_MASS",
} as const;
export type SessionSlot = ValueOf<typeof SessionSlot>;

/** Dia da semana de cada período (0 = domingo). */
export const SLOT_WEEKDAY: Record<SessionSlot, number> = {
  SATURDAY_MORNING: 6,
  SATURDAY_AFTERNOON: 6,
  SUNDAY_AFTER_MASS: 0,
};

export const Gender = { MALE: "MALE", FEMALE: "FEMALE" } as const;
export type Gender = ValueOf<typeof Gender>;

export const GuardianRelationship = {
  FATHER: "FATHER",
  MOTHER: "MOTHER",
  GRANDPARENT: "GRANDPARENT",
  UNCLE_AUNT: "UNCLE_AUNT",
  OTHER: "OTHER",
} as const;
export type GuardianRelationship = ValueOf<typeof GuardianRelationship>;

export const EnrollmentStatus = {
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
  WAITLIST: "WAITLIST",
} as const;
export type EnrollmentStatus = ValueOf<typeof EnrollmentStatus>;

export const EnrollmentType = { NEW: "NEW", RENEWAL: "RENEWAL", TRANSFER: "TRANSFER" } as const;
export type EnrollmentType = ValueOf<typeof EnrollmentType>;

export const ClassCatechistRole = { LEAD: "LEAD", ASSISTANT: "ASSISTANT" } as const;
export type ClassCatechistRole = ValueOf<typeof ClassCatechistRole>;

export const AttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  JUSTIFIED: "JUSTIFIED",
} as const;
export type AttendanceStatus = ValueOf<typeof AttendanceStatus>;

export const YearOutcome = { PASSED: "PASSED", REPEAT: "REPEAT" } as const;
export type YearOutcome = ValueOf<typeof YearOutcome>;

/** Idade a partir da qual alguém se inscreve sozinho. */
export const ADULT_AGE = 18;

const LEVEL_LABEL: Record<CatechesisLevel, string> = {
  BAPTISM_PRE: "Pré-Batismo",
  BAPTISM_1: "Batismo · 1.º ano",
  BAPTISM_2: "Batismo · 2.º ano",
  BAPTISM_3: "Batismo · 3.º ano",
  COMMUNION_PRE: "Pré-Comunhão",
  COMMUNION_1: "Comunhão · 1.º ano",
  COMMUNION_2: "Comunhão · 2.º ano",
  COMMUNION_3: "Comunhão · 3.º ano",
  BIBLICAL: "Bíblico",
  CONFIRMATION_1: "Crisma · 1.º ano",
  CONFIRMATION_2: "Crisma · 2.º ano",
  CONFIRMATION_3: "Crisma · 3.º ano",
};

export const SLOT_LABEL: Record<SessionSlot, string> = {
  SATURDAY_MORNING: "Sábado de manhã",
  SATURDAY_AFTERNOON: "Sábado à tarde",
  SUNDAY_AFTER_MASS: "Domingo, depois da missa",
};

/** "Comunhão · 1.º ano" (para mensagens e registo de atividade). */
export function formatLevel(level: CatechesisLevel): string {
  return LEVEL_LABEL[level];
}
