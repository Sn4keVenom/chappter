// src/api/auditlog.ts
// GET /audit-log (Super Admin only). Same thin apiClient-wrapper pattern as
// every other api/*.ts file.

import { apiClient } from "./client";
import type { AuditLogEntry } from "../types";

export async function getAuditLog(params?: {
  entityType?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number; page: number; limit: number }> {
  const { data } = await apiClient.get("/audit-log", { params });
  return data;
}
