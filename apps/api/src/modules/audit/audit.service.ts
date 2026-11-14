import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '../../generated/client/client.js';
import type {
  AdminAuditQueryInput,
  AdminAuditListResponse,
  AdminAuditStats,
  UnifiedAuditLogItem,
  AuditActorItem,
} from './audit.schemas.js';

export class AuditService {
  /**
   * Lists administrative audit logs across all persistent domain models.
   */
  async listAuditLogs(query: AdminAuditQueryInput): Promise<AdminAuditListResponse> {
    const { category, page, limit, actorId, dateFrom, dateTo, search } = query;
    const skip = (page - 1) * limit;

    const dateFilter =
      dateFrom || dateTo
        ? {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          }
        : undefined;

    // Helper to format actor object
    const formatActor = (
      user: {
        id: string;
        email: string;
        role?: string;
        profile?: { firstName: string; lastName: string } | null;
      } | null,
    ) => {
      if (!user) return null;
      const name = user.profile
        ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
        : user.email.split('@')[0];
      return {
        id: user.id,
        email: user.email,
        name: name || user.email,
        role: user.role,
      };
    };

    // 1. Compute Category Stats
    const [
      orderEvents,
      returnEvents,
      refundEvents,
      inventoryEvents,
      pricingEvents,
      customerEvents,
    ] = await Promise.all([
      prisma.orderStatusHistory.count(),
      prisma.returnStatusHistory.count(),
      prisma.refund.count(),
      prisma.inventoryAdjustment.count(),
      prisma.priceHistory.count(),
      prisma.customerStatusHistory.count(),
    ]);

    const stats: AdminAuditStats = {
      totalEvents:
        orderEvents +
        returnEvents +
        refundEvents +
        inventoryEvents +
        pricingEvents +
        customerEvents,
      orderEvents,
      returnEvents,
      refundEvents,
      inventoryEvents,
      pricingEvents,
      customerEvents,
    };

    // 2. Fetch according to Category
    if (category === 'ORDERS') {
      const where: Prisma.OrderStatusHistoryWhereInput = {};
      if (dateFilter) where.createdAt = dateFilter;
      if (actorId) where.changedByUserId = actorId;
      if (search) {
        where.OR = [
          { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
          { reason: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.orderStatusHistory.count({ where }),
        prisma.orderStatusHistory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            order: { select: { id: true, orderNumber: true } },
            changedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const logs: UnifiedAuditLogItem[] = rows.map((r) => ({
        id: r.id,
        category: 'ORDERS',
        action: `${r.fromStatus ?? 'INITIAL'} → ${r.toStatus}`,
        entityType: 'Order',
        entityId: r.order.id,
        entityReference: r.order.orderNumber,
        actor: formatActor(r.changedByUser),
        reason: r.reason,
        details: { fromStatus: r.fromStatus, toStatus: r.toStatus },
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        logs,
        stats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    if (category === 'RETURNS') {
      const where: Prisma.ReturnStatusHistoryWhereInput = {};
      if (dateFilter) where.createdAt = dateFilter;
      if (actorId) where.changedByUserId = actorId;
      if (search) {
        where.OR = [
          { returnRequest: { returnNumber: { contains: search, mode: 'insensitive' } } },
          { returnRequest: { order: { orderNumber: { contains: search, mode: 'insensitive' } } } },
          { reason: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.returnStatusHistory.count({ where }),
        prisma.returnStatusHistory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            returnRequest: {
              select: {
                id: true,
                returnNumber: true,
                order: { select: { orderNumber: true } },
              },
            },
            changedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const logs: UnifiedAuditLogItem[] = rows.map((r) => ({
        id: r.id,
        category: 'RETURNS',
        action: `${r.fromStatus ?? 'INITIAL'} → ${r.toStatus}`,
        entityType: 'ReturnRequest',
        entityId: r.returnRequest.id,
        entityReference: r.returnRequest.returnNumber,
        actor: formatActor(r.changedByUser),
        reason: r.reason,
        details: {
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          orderNumber: r.returnRequest.order.orderNumber,
        },
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        logs,
        stats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    if (category === 'REFUNDS') {
      const where: Prisma.RefundWhereInput = {};
      if (dateFilter) where.createdAt = dateFilter;
      if (actorId) where.processedByUserId = actorId;
      if (search) {
        where.OR = [
          { refundNumber: { contains: search, mode: 'insensitive' } },
          { returnRequest: { returnNumber: { contains: search, mode: 'insensitive' } } },
          { payment: { transactionId: { contains: search, mode: 'insensitive' } } },
          { gatewayReference: { contains: search, mode: 'insensitive' } },
          { payoutReference: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.refund.count({ where }),
        prisma.refund.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            returnRequest: {
              select: {
                id: true,
                returnNumber: true,
                order: { select: { orderNumber: true } },
              },
            },
            payment: { select: { transactionId: true } },
            processedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const logs: UnifiedAuditLogItem[] = rows.map((r) => ({
        id: r.id,
        category: 'REFUNDS',
        action: `REFUND_${r.method}_${r.status}`,
        entityType: 'Refund',
        entityId: r.id,
        entityReference: r.refundNumber,
        actor: formatActor(r.processedByUser),
        reason: r.failureReason ?? (r.payoutChannel ? `Payout via ${r.payoutChannel}` : null),
        details: {
          amount: r.amount,
          merchandiseAmount: r.merchandiseAmount,
          shippingAmount: r.shippingAmount,
          method: r.method,
          status: r.status,
          gatewayReference: r.gatewayReference,
          payoutReference: r.payoutReference,
          payoutChannel: r.payoutChannel,
          orderNumber: r.returnRequest.order.orderNumber,
          transactionId: r.payment.transactionId,
        },
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        logs,
        stats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    if (category === 'INVENTORY') {
      const where: Prisma.InventoryAdjustmentWhereInput = {};
      if (dateFilter) where.createdAt = dateFilter;
      if (actorId) where.adjustedByUserId = actorId;
      if (search) {
        where.OR = [
          { inventoryItem: { variant: { sku: { contains: search, mode: 'insensitive' } } } },
          {
            inventoryItem: {
              variant: { product: { name: { contains: search, mode: 'insensitive' } } },
            },
          },
          { reason: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.inventoryAdjustment.count({ where }),
        prisma.inventoryAdjustment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            inventoryItem: {
              select: {
                id: true,
                variant: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    product: { select: { name: true } },
                  },
                },
              },
            },
            adjustedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const logs: UnifiedAuditLogItem[] = rows.map((r) => ({
        id: r.id,
        category: 'INVENTORY',
        action: `INVENTORY_${r.type} (${r.quantityDelta > 0 ? `+${r.quantityDelta}` : r.quantityDelta})`,
        entityType: 'InventoryItem',
        entityId: r.inventoryItem.id,
        entityReference: r.inventoryItem.variant.sku,
        actor: formatActor(r.adjustedByUser),
        reason: r.reason,
        details: {
          productName: r.inventoryItem.variant.product.name,
          variantTitle: r.inventoryItem.variant.name,
          type: r.type,
          quantityDelta: r.quantityDelta,
          oldQuantity: r.oldQuantity,
          newQuantity: r.newQuantity,
        },
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        logs,
        stats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    if (category === 'PRICING') {
      const where: Prisma.PriceHistoryWhereInput = {};
      if (dateFilter) where.createdAt = dateFilter;
      if (actorId) where.changedByUserId = actorId;
      if (search) {
        where.OR = [
          { variant: { sku: { contains: search, mode: 'insensitive' } } },
          { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
          { reason: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.priceHistory.count({ where }),
        prisma.priceHistory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                name: true,
                product: { select: { name: true } },
              },
            },
            changedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const logs: UnifiedAuditLogItem[] = rows.map((r) => ({
        id: r.id,
        category: 'PRICING',
        action: `PRICE_CHANGE: ৳${(r.oldPrice / 100).toFixed(0)} → ৳${(r.newPrice / 100).toFixed(0)}`,
        entityType: 'ProductVariant',
        entityId: r.variant.id,
        entityReference: r.variant.sku,
        actor: formatActor(r.changedByUser),
        reason: r.reason,
        details: {
          productName: r.variant.product.name,
          variantTitle: r.variant.name,
          oldPrice: r.oldPrice,
          newPrice: r.newPrice,
          oldCompareAt: r.oldCompareAt,
          newCompareAt: r.newCompareAt,
          oldCostPrice: r.oldCostPrice,
          newCostPrice: r.newCostPrice,
        },
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        logs,
        stats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    if (category === 'CUSTOMERS') {
      const where: Prisma.CustomerStatusHistoryWhereInput = {};
      if (dateFilter) where.createdAt = dateFilter;
      if (actorId) where.changedByUserId = actorId;
      if (search) {
        where.OR = [
          { customer: { email: { contains: search, mode: 'insensitive' } } },
          { customer: { profile: { firstName: { contains: search, mode: 'insensitive' } } } },
          { customer: { profile: { lastName: { contains: search, mode: 'insensitive' } } } },
          { reason: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.customerStatusHistory.count({ where }),
        prisma.customerStatusHistory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                profile: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
            changedByUser: {
              select: {
                id: true,
                email: true,
                role: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const logs: UnifiedAuditLogItem[] = rows.map((r) => {
        const customerName = r.customer.profile
          ? `${r.customer.profile.firstName} ${r.customer.profile.lastName}`.trim()
          : r.customer.email;

        return {
          id: r.id,
          category: 'CUSTOMERS',
          action: `CUSTOMER_${r.toStatus}`,
          entityType: 'Customer',
          entityId: r.customer.id,
          entityReference: r.customer.email,
          actor: formatActor(r.changedByUser),
          reason: r.reason,
          details: {
            fromStatus: r.fromStatus,
            toStatus: r.toStatus,
            customerName,
          },
          createdAt: r.createdAt.toISOString(),
        };
      });

      return {
        logs,
        stats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    // -------------------------------------------------------------
    // Category = 'ALL': Bounded Parallel Query & Deterministic Merge
    // -------------------------------------------------------------
    const fetchLimit = skip + limit;

    const [orderLogs, returnLogs, refundLogs, invLogs, priceLogs, custLogs] = await Promise.all([
      // Orders
      (async () => {
        const where: Prisma.OrderStatusHistoryWhereInput = {};
        if (dateFilter) where.createdAt = dateFilter;
        if (actorId) where.changedByUserId = actorId;
        if (search) {
          where.OR = [
            { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
            { reason: { contains: search, mode: 'insensitive' } },
          ];
        }
        const [cnt, rows] = await Promise.all([
          prisma.orderStatusHistory.count({ where }),
          prisma.orderStatusHistory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              order: { select: { id: true, orderNumber: true } },
              changedByUser: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          }),
        ]);
        return {
          cnt,
          items: rows.map((r): UnifiedAuditLogItem => ({
            id: r.id,
            category: 'ORDERS',
            action: `${r.fromStatus ?? 'INITIAL'} → ${r.toStatus}`,
            entityType: 'Order',
            entityId: r.order.id,
            entityReference: r.order.orderNumber,
            actor: formatActor(r.changedByUser),
            reason: r.reason,
            details: { fromStatus: r.fromStatus, toStatus: r.toStatus },
            createdAt: r.createdAt.toISOString(),
          })),
        };
      })(),

      // Returns
      (async () => {
        const where: Prisma.ReturnStatusHistoryWhereInput = {};
        if (dateFilter) where.createdAt = dateFilter;
        if (actorId) where.changedByUserId = actorId;
        if (search) {
          where.OR = [
            { returnRequest: { returnNumber: { contains: search, mode: 'insensitive' } } },
            {
              returnRequest: { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
            },
            { reason: { contains: search, mode: 'insensitive' } },
          ];
        }
        const [cnt, rows] = await Promise.all([
          prisma.returnStatusHistory.count({ where }),
          prisma.returnStatusHistory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              returnRequest: {
                select: {
                  id: true,
                  returnNumber: true,
                  order: { select: { orderNumber: true } },
                },
              },
              changedByUser: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          }),
        ]);
        return {
          cnt,
          items: rows.map((r): UnifiedAuditLogItem => ({
            id: r.id,
            category: 'RETURNS',
            action: `${r.fromStatus ?? 'INITIAL'} → ${r.toStatus}`,
            entityType: 'ReturnRequest',
            entityId: r.returnRequest.id,
            entityReference: r.returnRequest.returnNumber,
            actor: formatActor(r.changedByUser),
            reason: r.reason,
            details: {
              fromStatus: r.fromStatus,
              toStatus: r.toStatus,
              orderNumber: r.returnRequest.order.orderNumber,
            },
            createdAt: r.createdAt.toISOString(),
          })),
        };
      })(),

      // Refunds
      (async () => {
        const where: Prisma.RefundWhereInput = {};
        if (dateFilter) where.createdAt = dateFilter;
        if (actorId) where.processedByUserId = actorId;
        if (search) {
          where.OR = [
            { refundNumber: { contains: search, mode: 'insensitive' } },
            { returnRequest: { returnNumber: { contains: search, mode: 'insensitive' } } },
            { payment: { transactionId: { contains: search, mode: 'insensitive' } } },
            { gatewayReference: { contains: search, mode: 'insensitive' } },
            { payoutReference: { contains: search, mode: 'insensitive' } },
          ];
        }
        const [cnt, rows] = await Promise.all([
          prisma.refund.count({ where }),
          prisma.refund.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              returnRequest: {
                select: {
                  id: true,
                  returnNumber: true,
                  order: { select: { orderNumber: true } },
                },
              },
              payment: { select: { transactionId: true } },
              processedByUser: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          }),
        ]);
        return {
          cnt,
          items: rows.map((r): UnifiedAuditLogItem => ({
            id: r.id,
            category: 'REFUNDS',
            action: `REFUND_${r.method}_${r.status}`,
            entityType: 'Refund',
            entityId: r.id,
            entityReference: r.refundNumber,
            actor: formatActor(r.processedByUser),
            reason: r.failureReason ?? (r.payoutChannel ? `Payout via ${r.payoutChannel}` : null),
            details: {
              amount: r.amount,
              merchandiseAmount: r.merchandiseAmount,
              shippingAmount: r.shippingAmount,
              method: r.method,
              status: r.status,
              gatewayReference: r.gatewayReference,
              payoutReference: r.payoutReference,
              payoutChannel: r.payoutChannel,
              orderNumber: r.returnRequest.order.orderNumber,
              transactionId: r.payment.transactionId,
            },
            createdAt: r.createdAt.toISOString(),
          })),
        };
      })(),

      // Inventory
      (async () => {
        const where: Prisma.InventoryAdjustmentWhereInput = {};
        if (dateFilter) where.createdAt = dateFilter;
        if (actorId) where.adjustedByUserId = actorId;
        if (search) {
          where.OR = [
            { inventoryItem: { variant: { sku: { contains: search, mode: 'insensitive' } } } },
            {
              inventoryItem: {
                variant: { product: { name: { contains: search, mode: 'insensitive' } } },
              },
            },
            { reason: { contains: search, mode: 'insensitive' } },
          ];
        }
        const [cnt, rows] = await Promise.all([
          prisma.inventoryAdjustment.count({ where }),
          prisma.inventoryAdjustment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  variant: {
                    select: {
                      id: true,
                      sku: true,
                      name: true,
                      product: { select: { name: true } },
                    },
                  },
                },
              },
              adjustedByUser: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          }),
        ]);
        return {
          cnt,
          items: rows.map((r): UnifiedAuditLogItem => ({
            id: r.id,
            category: 'INVENTORY',
            action: `INVENTORY_${r.type} (${r.quantityDelta > 0 ? `+${r.quantityDelta}` : r.quantityDelta})`,
            entityType: 'InventoryItem',
            entityId: r.inventoryItem.id,
            entityReference: r.inventoryItem.variant.sku,
            actor: formatActor(r.adjustedByUser),
            reason: r.reason,
            details: {
              productName: r.inventoryItem.variant.product.name,
              variantTitle: r.inventoryItem.variant.name,
              type: r.type,
              quantityDelta: r.quantityDelta,
              oldQuantity: r.oldQuantity,
              newQuantity: r.newQuantity,
            },
            createdAt: r.createdAt.toISOString(),
          })),
        };
      })(),

      // Pricing
      (async () => {
        const where: Prisma.PriceHistoryWhereInput = {};
        if (dateFilter) where.createdAt = dateFilter;
        if (actorId) where.changedByUserId = actorId;
        if (search) {
          where.OR = [
            { variant: { sku: { contains: search, mode: 'insensitive' } } },
            { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
            { reason: { contains: search, mode: 'insensitive' } },
          ];
        }
        const [cnt, rows] = await Promise.all([
          prisma.priceHistory.count({ where }),
          prisma.priceHistory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  product: { select: { name: true } },
                },
              },
              changedByUser: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          }),
        ]);
        return {
          cnt,
          items: rows.map((r): UnifiedAuditLogItem => ({
            id: r.id,
            category: 'PRICING',
            action: `PRICE_CHANGE: ৳${(r.oldPrice / 100).toFixed(0)} → ৳${(r.newPrice / 100).toFixed(0)}`,
            entityType: 'ProductVariant',
            entityId: r.variant.id,
            entityReference: r.variant.sku,
            actor: formatActor(r.changedByUser),
            reason: r.reason,
            details: {
              productName: r.variant.product.name,
              variantTitle: r.variant.name,
              oldPrice: r.oldPrice,
              newPrice: r.newPrice,
              oldCompareAt: r.oldCompareAt,
              newCompareAt: r.newCompareAt,
              oldCostPrice: r.oldCostPrice,
              newCostPrice: r.newCostPrice,
            },
            createdAt: r.createdAt.toISOString(),
          })),
        };
      })(),

      // Customers
      (async () => {
        const where: Prisma.CustomerStatusHistoryWhereInput = {};
        if (dateFilter) where.createdAt = dateFilter;
        if (actorId) where.changedByUserId = actorId;
        if (search) {
          where.OR = [
            { customer: { email: { contains: search, mode: 'insensitive' } } },
            { customer: { profile: { firstName: { contains: search, mode: 'insensitive' } } } },
            { customer: { profile: { lastName: { contains: search, mode: 'insensitive' } } } },
            { reason: { contains: search, mode: 'insensitive' } },
          ];
        }
        const [cnt, rows] = await Promise.all([
          prisma.customerStatusHistory.count({ where }),
          prisma.customerStatusHistory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchLimit,
            include: {
              customer: {
                select: {
                  id: true,
                  email: true,
                  profile: { select: { firstName: true, lastName: true, phone: true } },
                },
              },
              changedByUser: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          }),
        ]);
        return {
          cnt,
          items: rows.map((r): UnifiedAuditLogItem => {
            const customerName = r.customer.profile
              ? `${r.customer.profile.firstName} ${r.customer.profile.lastName}`.trim()
              : r.customer.email;
            return {
              id: r.id,
              category: 'CUSTOMERS',
              action: `CUSTOMER_${r.toStatus}`,
              entityType: 'Customer',
              entityId: r.customer.id,
              entityReference: r.customer.email,
              actor: formatActor(r.changedByUser),
              reason: r.reason,
              details: {
                fromStatus: r.fromStatus,
                toStatus: r.toStatus,
                customerName,
              },
              createdAt: r.createdAt.toISOString(),
            };
          }),
        };
      })(),
    ]);

    const totalMatching =
      orderLogs.cnt + returnLogs.cnt + refundLogs.cnt + invLogs.cnt + priceLogs.cnt + custLogs.cnt;

    // Merge and sort deterministically by createdAt DESC, id ASC
    const allItems = [
      ...orderLogs.items,
      ...returnLogs.items,
      ...refundLogs.items,
      ...invLogs.items,
      ...priceLogs.items,
      ...custLogs.items,
    ];

    allItems.sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    const paginatedItems = allItems.slice(skip, skip + limit);

    return {
      logs: paginatedItems,
      stats,
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limit),
      },
    };
  }

  /**
   * Returns list of admin actors for dropdown filtering.
   */
  async listAuditActors(): Promise<AuditActorItem[]> {
    const adminUsers = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        role: true,
        profile: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { email: 'asc' },
    });

    return adminUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.profile
        ? `${u.profile.firstName} ${u.profile.lastName}`.trim()
        : u.email.split('@')[0],
      role: u.role,
    }));
  }
}

export const auditService = new AuditService();
