import { z } from 'zod';
import { UserStatus } from '../../generated/client/client.js';

export const adminCustomerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED']).default('ALL'),
  registeredFrom: z.string().datetime().optional(),
  registeredTo: z.string().datetime().optional(),
  minOrders: z.coerce.number().int().min(0).optional(),
  maxOrders: z.coerce.number().int().min(0).optional(),
  sortBy: z
    .enum([
      'newest',
      'oldest',
      'nameAsc',
      'nameDesc',
      'orderCountAsc',
      'orderCountDesc',
      'ltvAsc',
      'ltvDesc',
    ])
    .default('newest'),
});

export type AdminCustomerQueryInput = z.infer<typeof adminCustomerQuerySchema>;

export const updateCustomerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z
    .string()
    .trim()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters'),
});

export type UpdateCustomerStatusInput = z.infer<typeof updateCustomerStatusSchema>;

export interface CustomerFinancials {
  grossSpent: number; // Sum of PAID payments in poisha
  totalRefunded: number; // Sum of COMPLETED refunds in poisha
  lifetimeValue: number; // max(0, grossSpent - totalRefunded) in poisha
}

export interface CustomerOrderStats {
  totalOrderCount: number; // All orders placed
  completedOrderCount: number; // Orders in DELIVERED status
  cancelledOrderCount: number; // Orders in CANCELLED status
  returnCount: number; // All return requests placed
  completedReturnCount: number; // Return requests in COMPLETED status
}

export interface AdminCustomerListItem {
  id: string;
  email: string;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
  } | null;
  financials: CustomerFinancials;
  orderStats: CustomerOrderStats;
  lastOrderDate: string | null;
}

export interface AdminCustomerListStats {
  totalCustomers: number;
  activeCustomers: number;
  suspendedCustomers: number;
  verifiedCustomers: number;
}

export interface AdminCustomerListResponse {
  customers: AdminCustomerListItem[];
  stats: AdminCustomerListStats;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminCustomerDetailResponse {
  customer: {
    id: string;
    email: string;
    role: string;
    status: UserStatus;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      avatarUrl: string | null;
    } | null;
    oauthAccounts: Array<{
      provider: string;
      providerAccountId: string;
      createdAt: string;
    }>;
    lastActiveAt: string | null;
    financials: CustomerFinancials;
    orderStats: CustomerOrderStats;
    addresses: Array<{
      id: string;
      recipientName: string;
      phone: string;
      divisionId: string;
      districtId: string;
      upazila: string;
      streetAddress: string;
      postalCode: string | null;
      label: string | null;
      isDefault: boolean;
      createdAt: string;
    }>;
    recentOrders: Array<{
      id: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      merchandiseSubtotal: number;
      discountAmount: number;
      shippingFee: number;
      totalPayable: number;
      itemCount: number;
      createdAt: string;
    }>;
    recentReturns: Array<{
      id: string;
      returnNumber: string;
      orderId: string;
      orderNumber: string;
      status: string;
      customerReason: string;
      estimatedRefundAmount: number;
      actualRefundAmount: number | null;
      shippingFeeRefunded: boolean;
      createdAt: string;
    }>;
  };
}
