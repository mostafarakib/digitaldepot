export type CustomerStatus = 'ACTIVE' | 'SUSPENDED';

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
  status: CustomerStatus;
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

export interface CustomerAddress {
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
}

export interface CustomerRecentOrder {
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
}

export interface CustomerRecentReturn {
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
}

export interface AdminCustomerDetail {
  id: string;
  email: string;
  role: string;
  status: CustomerStatus;
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
  addresses: CustomerAddress[];
  recentOrders: CustomerRecentOrder[];
  recentReturns: CustomerRecentReturn[];
}

export interface AdminCustomerDetailResponse {
  customer: AdminCustomerDetail;
}

export interface AdminCustomerListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ALL' | 'ACTIVE' | 'SUSPENDED';
  registeredFrom?: string;
  registeredTo?: string;
  minOrders?: number;
  maxOrders?: number;
  sortBy?:
    | 'newest'
    | 'oldest'
    | 'nameAsc'
    | 'nameDesc'
    | 'orderCountAsc'
    | 'orderCountDesc'
    | 'ltvAsc'
    | 'ltvDesc';
}

export interface UpdateCustomerStatusInput {
  status: CustomerStatus;
  reason: string;
}
