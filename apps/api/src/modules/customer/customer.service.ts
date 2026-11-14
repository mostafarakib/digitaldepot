import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors.js';
import { Prisma, type UserStatus } from '../../generated/client/client.js';
import type {
  AdminCustomerQueryInput,
  AdminCustomerListResponse,
  AdminCustomerListItem,
  AdminCustomerDetailResponse,
  UpdateCustomerStatusInput,
  CustomerFinancials,
  CustomerOrderStats,
} from './customer.schemas.js';

export class CustomerService {
  /**
   * Computes authoritative financial metrics and LTV for a specific customer.
   * Clarification 4: LTV is strictly PAID Payment amounts minus COMPLETED Refund amounts in integer poisha.
   */
  async computeCustomerFinancials(customerId: string): Promise<CustomerFinancials> {
    const [paidPayments, completedRefunds] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: 'PAID',
          order: { userId: customerId },
        },
        select: { amount: true },
      }),
      prisma.refund.findMany({
        where: {
          status: 'COMPLETED',
          returnRequest: { userId: customerId },
        },
        select: { amount: true },
      }),
    ]);

    const grossSpent = paidPayments.reduce((acc, p) => acc + p.amount, 0);
    const totalRefunded = completedRefunds.reduce((acc, r) => acc + r.amount, 0);
    const lifetimeValue = Math.max(0, grossSpent - totalRefunded);

    return {
      grossSpent,
      totalRefunded,
      lifetimeValue,
    };
  }

  /**
   * Computes authoritative order and return counts for a specific customer.
   * Clarification 3: Total orders vs completed/delivered orders are defined and reported separately.
   */
  async computeCustomerOrderStats(customerId: string): Promise<CustomerOrderStats> {
    const [orders, returnRequests] = await Promise.all([
      prisma.order.findMany({
        where: { userId: customerId },
        select: { status: true },
      }),
      prisma.returnRequest.findMany({
        where: { userId: customerId },
        select: { status: true },
      }),
    ]);

    const totalOrderCount = orders.length;
    const completedOrderCount = orders.filter((o) => o.status === 'DELIVERED').length;
    const cancelledOrderCount = orders.filter((o) => o.status === 'CANCELLED').length;

    const returnCount = returnRequests.length;
    const completedReturnCount = returnRequests.filter((r) => r.status === 'COMPLETED').length;

    return {
      totalOrderCount,
      completedOrderCount,
      cancelledOrderCount,
      returnCount,
      completedReturnCount,
    };
  }

  /**
   * Retrieves paginated directory of customers with filtering, sorting, and aggregated financial/order metrics.
   * Safe projections strictly exclude passwordHash and token secrets.
   */
  async listCustomers(query: AdminCustomerQueryInput): Promise<AdminCustomerListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
    };

    // 1. Status filter
    if (query.status && query.status !== 'ALL') {
      where.status = query.status as UserStatus;
    }

    // 2. Registration date range filter
    if (query.registeredFrom || query.registeredTo) {
      where.createdAt = {
        ...(query.registeredFrom ? { gte: new Date(query.registeredFrom) } : {}),
        ...(query.registeredTo ? { lte: new Date(query.registeredTo) } : {}),
      };
    }

    // 3. Search filter across email, name, phone
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        {
          profile: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { phone: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    // 4. Order count range filter
    if (query.minOrders !== undefined || query.maxOrders !== undefined) {
      const min = query.minOrders ?? 0;
      const havingConditions: Prisma.Sql[] = [Prisma.sql`COUNT(o.id) >= ${min}`];
      if (query.maxOrders !== undefined) {
        havingConditions.push(Prisma.sql`COUNT(o.id) <= ${query.maxOrders}`);
      }

      const matchingRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT u.id
        FROM "User" u
        LEFT JOIN "Order" o ON o."customerId" = u.id
        WHERE u.role = 'CUSTOMER'
        GROUP BY u.id
        HAVING ${Prisma.join(havingConditions, ' AND ')}
      `);

      const matchingIds = matchingRows.map((r) => r.id);
      if (
        where.id &&
        typeof where.id === 'object' &&
        'in' in where.id &&
        Array.isArray(where.id.in)
      ) {
        const existingSet = new Set(where.id.in as string[]);
        where.id = { in: matchingIds.filter((id) => existingSet.has(id)) };
      } else {
        where.id = { in: matchingIds };
      }
    }

    // 5. Sorting handling
    // Direct DB sorts
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sortBy === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (query.sortBy === 'nameAsc') {
      orderBy = { profile: { firstName: 'asc' } };
    } else if (query.sortBy === 'nameDesc') {
      orderBy = { profile: { firstName: 'desc' } };
    } else if (query.sortBy === 'orderCountAsc') {
      orderBy = { orders: { _count: 'asc' } };
    } else if (query.sortBy === 'orderCountDesc') {
      orderBy = { orders: { _count: 'desc' } };
    }

    // If sorting by LTV, we need to sort by computed LTV across matching customers
    const isLtvSort = query.sortBy === 'ltvAsc' || query.sortBy === 'ltvDesc';

    // 6. Global Stats across all customers
    const [totalCustomers, activeCustomers, suspendedCustomers, verifiedCustomers] =
      await Promise.all([
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
        prisma.user.count({ where: { role: 'CUSTOMER', status: 'ACTIVE' } }),
        prisma.user.count({ where: { role: 'CUSTOMER', status: 'SUSPENDED' } }),
        prisma.user.count({ where: { role: 'CUSTOMER', emailVerified: true } }),
      ]);

    const totalMatching = await prisma.user.count({ where });

    // Fetch user records
    let userRows: Array<{
      id: string;
      email: string;
      status: UserStatus;
      emailVerified: boolean;
      emailVerifiedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      profile: {
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
      } | null;
      orders: Array<{ id: string; status: string; createdAt: Date }>;
      returnRequests: Array<{ id: string; status: string }>;
    }>;

    if (isLtvSort) {
      // For LTV sorting, fetch matching candidates, calculate financials, then slice page
      userRows = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          status: true,
          emailVerified: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
            },
          },
          orders: {
            select: { id: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
          returnRequests: {
            select: { id: true, status: true },
          },
        },
      });
    } else {
      userRows = await prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          email: true,
          status: true,
          emailVerified: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
            },
          },
          orders: {
            select: { id: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
          returnRequests: {
            select: { id: true, status: true },
          },
        },
      });
    }

    // Batch query payments and refunds for selected customers to compute LTV without N+1 queries
    const candidateIds = userRows.map((u) => u.id);
    const [payments, refunds] = await Promise.all([
      candidateIds.length > 0
        ? prisma.payment.findMany({
            where: {
              status: 'PAID',
              order: { userId: { in: candidateIds } },
            },
            select: {
              amount: true,
              order: { select: { userId: true } },
            },
          })
        : [],
      candidateIds.length > 0
        ? prisma.refund.findMany({
            where: {
              status: 'COMPLETED',
              returnRequest: { userId: { in: candidateIds } },
            },
            select: {
              amount: true,
              returnRequest: { select: { userId: true } },
            },
          })
        : [],
    ]);

    // Map aggregates by customer ID
    const paidByCustomer = new Map<string, number>();
    for (const p of payments) {
      const uId = p.order.userId;
      paidByCustomer.set(uId, (paidByCustomer.get(uId) ?? 0) + p.amount);
    }

    const refundedByCustomer = new Map<string, number>();
    for (const r of refunds) {
      const uId = r.returnRequest.userId;
      refundedByCustomer.set(uId, (refundedByCustomer.get(uId) ?? 0) + r.amount);
    }

    let customerItems: AdminCustomerListItem[] = userRows.map((user) => {
      const grossSpent = paidByCustomer.get(user.id) ?? 0;
      const totalRefunded = refundedByCustomer.get(user.id) ?? 0;
      const lifetimeValue = Math.max(0, grossSpent - totalRefunded);

      const totalOrderCount = user.orders.length;
      const completedOrderCount = user.orders.filter((o) => o.status === 'DELIVERED').length;
      const cancelledOrderCount = user.orders.filter((o) => o.status === 'CANCELLED').length;
      const returnCount = user.returnRequests.length;
      const completedReturnCount = user.returnRequests.filter(
        (r) => r.status === 'COMPLETED',
      ).length;

      const lastOrder = user.orders[0];

      return {
        id: user.id,
        email: user.email,
        status: user.status,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        profile: user.profile,
        financials: {
          grossSpent,
          totalRefunded,
          lifetimeValue,
        },
        orderStats: {
          totalOrderCount,
          completedOrderCount,
          cancelledOrderCount,
          returnCount,
          completedReturnCount,
        },
        lastOrderDate: lastOrder ? lastOrder.createdAt.toISOString() : null,
      };
    });

    if (isLtvSort) {
      customerItems.sort((a, b) =>
        query.sortBy === 'ltvAsc'
          ? a.financials.lifetimeValue - b.financials.lifetimeValue
          : b.financials.lifetimeValue - a.financials.lifetimeValue,
      );
      customerItems = customerItems.slice(skip, skip + limit);
    }

    return {
      customers: customerItems,
      stats: {
        totalCustomers,
        activeCustomers,
        suspendedCustomers,
        verifiedCustomers,
      },
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limit),
      },
    };
  }

  /**
   * Retrieves comprehensive safe details for a single customer.
   * Includes profile, addresses, orders, return requests, and LTV.
   * Strictly forbids inspecting or returning ADMIN accounts.
   */
  async getCustomerDetail(customerId: string): Promise<AdminCustomerDetailResponse> {
    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
          },
        },
        oauthAccounts: {
          select: {
            provider: true,
            providerAccountId: true,
            createdAt: true,
          },
        },
        sessions: {
          orderBy: { lastUsedAt: 'desc' },
          take: 1,
          select: {
            lastUsedAt: true,
          },
        },
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            recipientName: true,
            phone: true,
            divisionId: true,
            districtId: true,
            upazila: true,
            streetAddress: true,
            postalCode: true,
            label: true,
            isDefault: true,
            createdAt: true,
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            merchandiseSubtotal: true,
            discountAmount: true,
            shippingFee: true,
            totalPayable: true,
            createdAt: true,
            _count: {
              select: { items: true },
            },
          },
        },
        returnRequests: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            returnNumber: true,
            orderId: true,
            order: { select: { orderNumber: true } },
            status: true,
            customerReason: true,
            estimatedRefundAmount: true,
            actualRefundAmount: true,
            shippingFeeRefunded: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('CUSTOMER_NOT_FOUND', 'Customer account not found');
    }

    if (user.role === 'ADMIN') {
      throw new ForbiddenError(
        'CANNOT_MANAGE_ADMIN_ACCOUNT',
        'Admin accounts cannot be managed through the customer directory',
      );
    }

    const [financials, orderStats] = await Promise.all([
      this.computeCustomerFinancials(customerId),
      this.computeCustomerOrderStats(customerId),
    ]);

    const lastActiveSession = user.sessions[0];

    return {
      customer: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        profile: user.profile,
        oauthAccounts: user.oauthAccounts.map((oa) => ({
          provider: oa.provider,
          providerAccountId: oa.providerAccountId,
          createdAt: oa.createdAt.toISOString(),
        })),
        lastActiveAt: lastActiveSession ? lastActiveSession.lastUsedAt.toISOString() : null,
        financials,
        orderStats,
        addresses: user.addresses.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        })),
        recentOrders: user.orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          merchandiseSubtotal: o.merchandiseSubtotal,
          discountAmount: o.discountAmount,
          shippingFee: o.shippingFee,
          totalPayable: o.totalPayable,
          itemCount: o._count.items,
          createdAt: o.createdAt.toISOString(),
        })),
        recentReturns: user.returnRequests.map((r) => ({
          id: r.id,
          returnNumber: r.returnNumber,
          orderId: r.orderId,
          orderNumber: r.order.orderNumber,
          status: r.status,
          customerReason: r.customerReason,
          estimatedRefundAmount: r.estimatedRefundAmount,
          actualRefundAmount: r.actualRefundAmount,
          shippingFeeRefunded: r.shippingFeeRefunded,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    };
  }

  /**
   * Updates customer account status (ACTIVE or SUSPENDED) with atomic session revocation and audit logging.
   * Clarification 1: When suspending, revoking sessions immediately blocks existing access tokens and refresh attempts.
   * Clarification 2: Records customer ID, previous status, new status, acting admin, reason, and timestamp.
   */
  async updateCustomerStatus(
    customerId: string,
    input: UpdateCustomerStatusInput,
    actingAdminId: string,
  ): Promise<AdminCustomerDetailResponse> {
    const updatedUser = await prisma.$transaction(async (tx) => {
      // 1. Fetch user to verify existence and protect ADMIN accounts
      const existingUser = await tx.user.findUnique({
        where: { id: customerId },
        select: { id: true, role: true, status: true, email: true },
      });

      if (!existingUser) {
        throw new NotFoundError('CUSTOMER_NOT_FOUND', 'Customer account not found');
      }

      if (existingUser.role === 'ADMIN') {
        throw new ForbiddenError(
          'CANNOT_MODIFY_ADMIN_ACCOUNT',
          'Admin accounts cannot be suspended or modified through customer management',
        );
      }

      if (existingUser.status === input.status) {
        throw new BadRequestError(
          'STATUS_ALREADY_SET',
          `Customer account is already in ${input.status} status`,
        );
      }

      const previousStatus = existingUser.status;

      // 2. Atomically update User status
      await tx.user.update({
        where: { id: customerId },
        data: { status: input.status },
      });

      // 3. Clarification 1: If suspending, immediately revoke all active sessions and refresh tokens
      if (input.status === 'SUSPENDED') {
        const now = new Date();
        await tx.session.updateMany({
          where: {
            userId: customerId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedReason: input.reason,
          },
        });

        // Also revoke all unrevoked RefreshTokens belonging to the user's sessions
        await tx.refreshToken.updateMany({
          where: {
            session: { userId: customerId },
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });
      }

      // 4. Record durable CustomerStatusHistory inside the transaction (Phase 8C)
      await tx.customerStatusHistory.create({
        data: {
          customerId,
          fromStatus: previousStatus,
          toStatus: input.status,
          reason: input.reason,
          changedByUserId: actingAdminId,
        },
      });

      // 5. Clarification 2: Record structured audit log in existing audit infrastructure
      logger.info(
        {
          event: 'CUSTOMER_STATUS_CHANGED',
          customerId,
          customerEmail: existingUser.email,
          previousStatus,
          newStatus: input.status,
          actingAdminId,
          reason: input.reason,
          timestamp: new Date().toISOString(),
        },
        `Customer status changed from ${previousStatus} to ${input.status}`,
      );

      return existingUser;
    });

    return this.getCustomerDetail(updatedUser.id);
  }
}

export const customerService = new CustomerService();
