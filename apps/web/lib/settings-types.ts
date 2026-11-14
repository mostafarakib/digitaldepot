export interface PublicStoreSettings {
  storeName: string;
  supportEmail: string;
  supportPhone: string | null;
  supportHours: string | null;
  storeAddress: string | null;
  insideDhakaShippingFee: number;
  outsideDhakaShippingFee: number;
  freeShippingThreshold: number;
  estimatedDaysInsideDhakaMin: number;
  estimatedDaysInsideDhakaMax: number;
  estimatedDaysOutsideDhakaMin: number;
  estimatedDaysOutsideDhakaMax: number;
}

export interface AdminStoreSettings extends PublicStoreSettings {
  id: string;
  updatedByUserId: string | null;
  updatedByUser: {
    id: string;
    email: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateStoreSettingsInput {
  insideDhakaShippingFee: number;
  outsideDhakaShippingFee: number;
  freeShippingThreshold: number;
  estimatedDaysInsideDhakaMin: number;
  estimatedDaysInsideDhakaMax: number;
  estimatedDaysOutsideDhakaMin: number;
  estimatedDaysOutsideDhakaMax: number;
  storeName: string;
  supportEmail: string;
  supportPhone?: string | null;
  supportHours?: string | null;
  storeAddress?: string | null;
}
