import type { Request, Response } from 'express';
import { couponService } from './coupon.service.js';
import {
  adminCreateCouponSchema,
  adminUpdateCouponSchema,
  adminCouponQuerySchema,
} from './coupon.schemas.js';
import { rotateCsrfToken } from '../../middleware/csrf.js';

export class CouponController {
  async list(req: Request, res: Response) {
    const query = adminCouponQuerySchema.parse(req.query);
    const result = await couponService.listCoupons(query);

    res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  }

  async getById(req: Request, res: Response) {
    const coupon = await couponService.getCouponById(req.params.id as string);
    res.json({
      success: true,
      data: coupon,
    });
  }

  async create(req: Request, res: Response) {
    const input = adminCreateCouponSchema.parse(req.body);
    const coupon = await couponService.createCoupon(input);
    rotateCsrfToken(res);

    res.status(201).json({
      success: true,
      data: coupon,
      message: 'Coupon created successfully',
    });
  }

  async update(req: Request, res: Response) {
    const input = adminUpdateCouponSchema.parse(req.body);
    const coupon = await couponService.updateCoupon(req.params.id as string, input);
    rotateCsrfToken(res);

    res.json({
      success: true,
      data: coupon,
      message: 'Coupon updated successfully',
    });
  }

  async toggleActive(req: Request, res: Response) {
    const coupon = await couponService.toggleActive(req.params.id as string);
    rotateCsrfToken(res);

    res.json({
      success: true,
      data: coupon,
      message: 'Coupon status updated successfully',
    });
  }

  async delete(req: Request, res: Response) {
    await couponService.deleteCoupon(req.params.id as string);
    rotateCsrfToken(res);

    res.json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  }
}

export const couponController = new CouponController();
