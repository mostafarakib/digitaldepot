export type AuditCategory =
  'ALL' | 'ORDERS' | 'RETURNS' | 'REFUNDS' | 'INVENTORY' | 'PRICING' | 'CUSTOMERS';

export interface AdminAuditQuery {
  page?: number;
  limit?: number;
  category?: AuditCategory;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

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

export interface AdminAuditActorsResponse {
  actors: AuditActorItem[];
}
