import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import {
  normalizeBdPhone,
  type CreateAddressInput,
  type UpdateAddressInput,
  type AddressOutput,
  type AddressListOutput,
} from './account.schemas.js';
import {
  isValidDivision,
  isValidDistrict,
  isDistrictInDivision,
  getDivisionById,
  getDistrictById,
  getDivisionsData,
  type DivisionData,
} from './data/bangladesh-geo.js';

interface AddressDbRecord {
  id: string;
  userId: string;
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function formatAddressOutput(record: AddressDbRecord): AddressOutput {
  const division = getDivisionById(record.divisionId);
  const district = getDistrictById(record.districtId);

  return {
    id: record.id,
    recipientName: record.recipientName,
    phone: record.phone,
    divisionId: record.divisionId,
    divisionNameEn: division?.nameEn ?? record.divisionId,
    divisionNameBn: division?.nameBn ?? record.divisionId,
    districtId: record.districtId,
    districtNameEn: district?.nameEn ?? record.districtId,
    districtNameBn: district?.nameBn ?? record.districtId,
    upazila: record.upazila,
    streetAddress: record.streetAddress,
    postalCode: record.postalCode,
    label: record.label,
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class AddressService {
  /**
   * Retrieves all saved delivery addresses for a customer.
   * Orders default address first, followed by most recently updated.
   */
  async listAddresses(userId: string): Promise<AddressListOutput> {
    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });

    return {
      addresses: addresses.map(formatAddressOutput),
      total: addresses.length,
      maxQuota: 10,
    };
  }

  /**
   * Retrieves a single address by ID with strict ownership isolation.
   */
  async getAddressById(userId: string, addressId: string): Promise<AddressOutput> {
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found');
    }

    return formatAddressOutput(address);
  }

  /**
   * Creates a new delivery address for a customer.
   * - Enforces maximum 10-address quota.
   * - Serializes concurrent operations via User row lock (SELECT FOR UPDATE).
   * - Invariant: First address created is always forced to default.
   * - Invariant: Setting new address as default atomically demotes previous default.
   */
  async createAddress(userId: string, input: CreateAddressInput): Promise<AddressOutput> {
    return prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive lock on the owning User row
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // 2. Count existing addresses under user lock
      const count = await tx.address.count({ where: { userId } });
      if (count >= 10) {
        throw new BadRequestError('ADDRESS_LIMIT_REACHED', 'Maximum limit of 10 addresses reached');
      }

      // 3. First address invariant: forced to default
      const isDefault = count === 0 ? true : (input.isDefault ?? false);

      // 4. If new address is default, demote existing default
      if (isDefault && count > 0) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // 5. Insert new address
      const created = await tx.address.create({
        data: {
          userId,
          recipientName: input.recipientName,
          phone: normalizeBdPhone(input.phone),
          divisionId: input.divisionId,
          districtId: input.districtId,
          upazila: input.upazila,
          streetAddress: input.streetAddress,
          postalCode: input.postalCode ?? null,
          label: input.label ?? null,
          isDefault,
        },
      });

      return formatAddressOutput(created);
    });
  }

  /**
   * Updates an existing address.
   * - Validates complete resulting divisionId/districtId pair (merged input + stored).
   * - Prohibits unsetting the current default address without selecting a replacement.
   * - Serializes under User row lock.
   */
  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<AddressOutput> {
    return prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive lock on owning User row
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // 2. Verify target address ownership
      const current = await tx.address.findFirst({
        where: { id: addressId, userId },
      });
      if (!current) {
        throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found');
      }

      // 3. Complete resulting geographical pair validation (Requirement 1)
      const targetDivisionId =
        input.divisionId !== undefined ? input.divisionId : current.divisionId;
      const targetDistrictId =
        input.districtId !== undefined ? input.districtId : current.districtId;

      if (!isValidDivision(targetDivisionId)) {
        throw new BadRequestError(
          'INVALID_GEOGRAPHY',
          `Invalid division ID: "${targetDivisionId}"`,
        );
      }
      if (!isValidDistrict(targetDistrictId)) {
        throw new BadRequestError(
          'INVALID_GEOGRAPHY',
          `Invalid district ID: "${targetDistrictId}"`,
        );
      }
      if (!isDistrictInDivision(targetDivisionId, targetDistrictId)) {
        throw new BadRequestError(
          'INVALID_GEOGRAPHY',
          `District "${targetDistrictId}" does not belong to division "${targetDivisionId}"`,
        );
      }

      // 4. Invariant: Cannot unset the current default address
      if (input.isDefault === false && current.isDefault === true) {
        throw new BadRequestError(
          'CANNOT_UNSET_DEFAULT',
          'Cannot unset the default address. Promote another address to default instead.',
        );
      }

      // 5. If promoting this address to default, demote existing default
      if (input.isDefault === true && current.isDefault === false) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // 6. Build and apply update payload
      const updateData: Record<string, unknown> = {};
      if (input.recipientName !== undefined) updateData.recipientName = input.recipientName;
      if (input.phone !== undefined) updateData.phone = normalizeBdPhone(input.phone);
      if (input.divisionId !== undefined) updateData.divisionId = input.divisionId;
      if (input.districtId !== undefined) updateData.districtId = input.districtId;
      if (input.upazila !== undefined) updateData.upazila = input.upazila;
      if (input.streetAddress !== undefined) updateData.streetAddress = input.streetAddress;
      if (input.postalCode !== undefined) updateData.postalCode = input.postalCode;
      if (input.label !== undefined) updateData.label = input.label;
      if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;

      const updated = await tx.address.update({
        where: { id: addressId },
        data: updateData,
      });

      return formatAddressOutput(updated);
    });
  }

  /**
   * Deletes an address with atomic default reallocation.
   * If the deleted address was default, deterministically selects and promotes
   * a replacement ordered by: updatedAt DESC, createdAt DESC, id ASC.
   */
  async deleteAddress(
    userId: string,
    addressId: string,
  ): Promise<{ success: true; message: string; reallocatedDefaultId: string | null }> {
    return prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive lock on owning User row
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // 2. Verify target address ownership
      const current = await tx.address.findFirst({
        where: { id: addressId, userId },
      });
      if (!current) {
        throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found');
      }

      // 3. Delete target address
      await tx.address.delete({ where: { id: addressId } });

      // 4. Default reallocation if deleted address was default
      let reallocatedDefaultId: string | null = null;
      if (current.isDefault) {
        const replacement = await tx.address.findFirst({
          where: { userId },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        });

        if (replacement) {
          await tx.address.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
          reallocatedDefaultId = replacement.id;
        }
      }

      return {
        success: true,
        message: 'Address deleted successfully',
        reallocatedDefaultId,
      };
    });
  }

  /**
   * Authoritatively sets an address as default.
   * Demotes any current default and promotes target under User row lock.
   */
  async setDefaultAddress(userId: string, addressId: string): Promise<AddressOutput> {
    return prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive lock on owning User row
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // 2. Verify target address ownership
      const target = await tx.address.findFirst({
        where: { id: addressId, userId },
      });
      if (!target) {
        throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found');
      }

      // 3. If already default, return target immediately
      if (target.isDefault) {
        return formatAddressOutput(target);
      }

      // 4. Demote current default
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      // 5. Promote target
      const updated = await tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });

      return formatAddressOutput(updated);
    });
  }

  /**
   * Retrieves the authoritative Bangladesh divisions and districts hierarchy.
   */
  getDivisions(): readonly DivisionData[] {
    return getDivisionsData();
  }
}

export const addressService = new AddressService();
