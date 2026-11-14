import { z } from 'zod';

export const auditCategoryEnum = z.enum([
  'ALL',
  'ORDERS',
  'RETURNS',
  'REFUNDS',
  'INVENTORY',
  'PRICING',
  'CUSTOMERS',
]);

export type AuditCategory = z.infer<typeof auditCategoryEnum>;

export const adminAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  category: auditCategoryEnum.default('ALL'),
  actorId: z.string().trim().optional(),
  dateFrom: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  dateTo: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  search: z.string().trim().optional(),
});

export type AdminAuditQueryInput = z.infer<typeof adminAuditQuerySchema>;

export interface UnifiedAuditLogItem {
  id: string;
  category: 'ORDERS' | 'RETURNS' | 'REFUNDS' | 'INVENTORY' | 'PRICING' | 'CUSTOMERS';
  action: string;
  entityType: string;
  entityId: string;
  entityReference: string;
  actor: {
    id: string;
    email: string;
    name: string;
    role?: string;
  } | null;
  reason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditStats {
  totalEvents: number;
  orderEvents: number;
  returnEvents: number;
  refundEvents: number;
  inventoryEvents: number;
  pricingEvents: number;
  customerEvents: number;
}

export interface AdminAuditListResponse {
  logs: UnifiedAuditLogItem[];
  stats: AdminAuditStats;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditActorItem {
  id: string;
  email: string;
  name: string;
  role: string;
}
