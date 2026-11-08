import type { Request, Response } from 'express';
import { accountService } from './account.service.js';
import { addressService } from './address.service.js';
import {
  updateProfileSchema,
  createAddressSchema,
  updateAddressSchema,
} from './account.schemas.js';
import { UnauthorizedError } from '../../lib/errors.js';

export class AccountController {
  /**
   * GET /api/v1/account/profile
   * Retrieves profile details and verification status for the authenticated customer.
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const data = await accountService.getProfile(req.user.id);

    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * PATCH /api/v1/account/profile
   * Updates customer profile fields (firstName, lastName, phone).
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const input = updateProfileSchema.parse(req.body);
    const profile = await accountService.updateProfile(req.user.id, input);

    res.status(200).json({
      success: true,
      data: {
        message: 'Profile updated successfully',
        profile,
      },
    });
  }

  /**
   * GET /api/v1/account/addresses/divisions
   * Retrieves the authoritative Bangladesh divisions and districts hierarchy.
   */
  async getDivisions(_req: Request, res: Response): Promise<void> {
    const divisions = addressService.getDivisions();

    res.status(200).json({
      success: true,
      data: {
        divisions,
      },
    });
  }

  /**
   * GET /api/v1/account/addresses
   * Lists all saved delivery addresses for the authenticated customer.
   */
  async getAddresses(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const data = await addressService.listAddresses(req.user.id);

    res.status(200).json({
      success: true,
      data,
    });
  }

  /**
   * GET /api/v1/account/addresses/:id
   * Retrieves a single address by ID (with strict ownership isolation).
   */
  async getAddressById(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const addressId = req.params.id as string;
    const address = await addressService.getAddressById(req.user.id, addressId);

    res.status(200).json({
      success: true,
      data: {
        address,
      },
    });
  }

  /**
   * POST /api/v1/account/addresses
   * Creates a new delivery address (quota enforced, first address is default).
   */
  async createAddress(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const input = createAddressSchema.parse(req.body);
    const address = await addressService.createAddress(req.user.id, input);

    res.status(201).json({
      success: true,
      data: {
        message: 'Address created successfully',
        address,
      },
    });
  }

  /**
   * PATCH /api/v1/account/addresses/:id
   * Updates an address with full resulting geographical pair validation.
   */
  async updateAddress(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const addressId = req.params.id as string;
    const input = updateAddressSchema.parse(req.body);
    const address = await addressService.updateAddress(req.user.id, addressId, input);

    res.status(200).json({
      success: true,
      data: {
        message: 'Address updated successfully',
        address,
      },
    });
  }

  /**
   * DELETE /api/v1/account/addresses/:id
   * Deletes an address and reallocates default deterministically if needed.
   */
  async deleteAddress(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const addressId = req.params.id as string;
    const result = await addressService.deleteAddress(req.user.id, addressId);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /**
   * PATCH /api/v1/account/addresses/:id/default
   * Promotes an address to default and demotes any existing default.
   */
  async setDefaultAddress(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const addressId = req.params.id as string;
    const address = await addressService.setDefaultAddress(req.user.id, addressId);

    res.status(200).json({
      success: true,
      data: {
        message: 'Default address updated successfully',
        address,
      },
    });
  }
}

export const accountController = new AccountController();
