import type { AccessRequest } from "../domain/access-request.js";
import type { PlatformSettings } from "../domain/platform-settings.js";

/** O que qualquer pessoa pode saber (o front-end decide o que mostrar). */
export interface PublicStatusView {
  launchMode: "BETA" | "PUBLIC";
  portalOpen: boolean;
  closedMessage?: string;
  reopensAt?: string;
}

/** Na administração: também quem mudou e quando. */
export interface PlatformStatusView extends PublicStatusView {
  launchChangedAt?: string;
  launchChangedBy?: string;
  portalChangedAt?: string;
  portalChangedBy?: string;
  pendingAccessRequests: number;
}

export interface AccessRequestView {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  profile: string;
  message?: string;
  status: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
}

export function toPublicStatus(settings: PlatformSettings): PublicStatusView {
  return {
    launchMode: settings.launchMode,
    portalOpen: settings.portalOpen,
    closedMessage: settings.closedMessage,
    reopensAt: settings.reopensAt,
  };
}

export function toPlatformStatus(
  settings: PlatformSettings,
  pendingAccessRequests: number,
): PlatformStatusView {
  return {
    ...toPublicStatus(settings),
    launchChangedAt: settings.launchChangedAt?.toISOString(),
    launchChangedBy: settings.launchChangedBy,
    portalChangedAt: settings.portalChangedAt?.toISOString(),
    portalChangedBy: settings.portalChangedBy,
    pendingAccessRequests,
  };
}

export function toAccessRequestView(request: AccessRequest): AccessRequestView {
  return {
    id: request.id.value,
    fullName: request.fullName,
    phone: request.phone.value,
    email: request.email?.value,
    profile: request.profile,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString(),
    decidedBy: request.decidedBy,
    decisionNote: request.decisionNote,
  };
}
