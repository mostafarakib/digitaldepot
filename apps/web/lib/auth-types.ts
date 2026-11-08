export type Role = 'CUSTOMER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  profile: CustomerProfile | null;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  locale?: 'en' | 'bn';
}

export interface ForgotPasswordData {
  email: string;
  locale?: 'en' | 'bn';
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

export interface RegisterResult {
  message: string;
  userId: string;
  csrfToken?: string;
}

export interface LoginResult {
  user: AuthenticatedUser;
  csrfToken?: string;
}

export interface SessionItem {
  id: string;
  isCurrent: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  revokeAllSessions?: boolean;
}

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ message: string; userId: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

export interface AddressItem {
  id: string;
  recipientName: string;
  phone: string;
  divisionId: string;
  divisionNameEn: string;
  divisionNameBn: string;
  districtId: string;
  districtNameEn: string;
  districtNameBn: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressListResponse {
  addresses: AddressItem[];
  total: number;
  maxQuota: number;
}

export interface DistrictItem {
  id: string;
  nameEn: string;
  nameBn: string;
}

export interface DivisionItem {
  id: string;
  nameEn: string;
  nameBn: string;
  districts: DistrictItem[];
}

export interface BangladeshDivisionsResponse {
  divisions: DivisionItem[];
}

export interface CreateAddressPayload {
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
}

export interface UpdateAddressPayload {
  recipientName?: string;
  phone?: string;
  divisionId?: string;
  districtId?: string;
  upazila?: string;
  streetAddress?: string;
  postalCode?: string | null;
  label?: string | null;
  isDefault?: boolean;
}
