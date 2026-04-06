import { prisma } from "@/lib/prisma";

interface AuditParams {
  companyId: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  devisId?: string;
  factureId?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      userName: params.userName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: (params.details ?? {}) as object,
      devisId: params.devisId,
      factureId: params.factureId,
    },
  });
}
