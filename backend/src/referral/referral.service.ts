import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { normalizeDigits } from '@salon/shared';
import { ValidationError } from '../catalog/validation-error.js';

export const REFERRAL_REWARD_AMOUNT_RIAL = 5_000_000;
export const REFERRAL_REQUIRED_BOOKINGS = 3;
export const REFERRAL_REWARD_DAYS = 30;

export class ReferralConflictError extends Error {
  readonly code = 'REFERRAL_EXISTS';
  constructor() {
    super('This salon has already been referred');
    this.name = 'ReferralConflictError';
  }
}

export class ReferralStateError extends Error {
  readonly code: string;
  constructor(code: 'NOT_FOUND' | 'NOT_REWARDABLE' | 'WRONG_SALON' | 'ALREADY_LINKED') {
    super(code);
    this.name = 'ReferralStateError';
    this.code = code;
  }
}

export interface ReferralInput {
  referrerId: string;
  salonName: string;
  city: string;
  salonPhone?: string;
  salonInstagram?: string;
}

export interface ReferralDto {
  id: string;
  salonId: string | null;
  salonName: string;
  salonPhone: string | null;
  salonInstagram: string | null;
  city: string | null;
  claimToken?: string;
  claimUrl?: string;
  status: string;
  qualifyingBookings: number;
  requiredBookings: number;
  rewardAmountRial: number;
  rewardStatus: string;
  rewardExpiresAt: Date | null;
  claimedAt: Date | null;
  qualifiedAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  referrerName?: string | null;
  referrerPhone?: string;
  linkedSalonName?: string | null;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ValidationError([{ field, message: 'مقدار واردشده معتبر نیست' }]);
  }
  return value.trim();
}

function normalizePhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const phone = normalizeDigits(value).replace(/[^\d]/g, '');
  if (!/^09\d{9}$/.test(phone)) {
    throw new ValidationError([{ field: 'salonPhone', message: 'شماره موبایل معتبر نیست' }]);
  }
  return phone;
}

function normalizeInstagram(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const handle = value.trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9._]{2,60}$/.test(handle)) {
    throw new ValidationError([{ field: 'salonInstagram', message: 'آیدی اینستاگرام معتبر نیست' }]);
  }
  return handle;
}

function salonKey(phone: string | undefined, instagram: string | undefined, name: string, city: string): string {
  if (phone) return 'phone:' + phone;
  if (instagram) return 'instagram:' + instagram;
  return 'name:' + normalizeDigits(name + ':' + city).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function inviteUrl(baseUrl: string | undefined, token: string): string | undefined {
  if (!baseUrl) return undefined;
  return baseUrl.replace(/\/+$/, '') + '/business/register?referral=' + encodeURIComponent(token);
}

type ReferralRow = {
  id: string;
  salonId: string | null;
  salonName: string;
  salonPhone: string | null;
  salonInstagram: string | null;
  city: string | null;
  claimToken: string;
  status: string;
  qualifyingBookings: number;
  requiredBookings: number;
  rewardAmountRial: bigint;
  rewardStatus: string;
  rewardExpiresAt: Date | null;
  claimedAt: Date | null;
  qualifiedAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  referrer?: { fullName: string | null; phone: string };
  salon?: { name: string } | null;
};

export class ReferralService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: { publicBaseUrl?: string } = {},
  ) {}

  async create(input: ReferralInput): Promise<ReferralDto> {
    const salonName = text(input.salonName, 'salonName', 120);
    const city = text(input.city, 'city', 80);
    const salonPhone = normalizePhone(input.salonPhone);
    const salonInstagram = normalizeInstagram(input.salonInstagram);
    if (!salonPhone && !salonInstagram) {
      throw new ValidationError([
        { field: 'salonPhone', message: 'شماره یا آیدی اینستاگرام سالن را وارد کنید' },
      ]);
    }

    try {
      const row = await this.prisma.salonReferral.create({
        data: {
          referrerId: input.referrerId,
          salonName,
          city,
          salonPhone,
          salonInstagram,
          normalizedKey: salonKey(salonPhone, salonInstagram, salonName, city),
          claimToken: randomUUID(),
          status: 'submitted',
          requiredBookings: REFERRAL_REQUIRED_BOOKINGS,
          rewardAmountRial: BigInt(REFERRAL_REWARD_AMOUNT_RIAL),
        },
        include: { salon: { select: { name: true } } },
      });
      return this.toDto(row, true);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ReferralConflictError();
      throw error;
    }
  }

  async listForCustomer(customerId: string): Promise<ReferralDto[]> {
    const rows = await this.prisma.salonReferral.findMany({
      where: { referrerId: customerId },
      orderBy: { createdAt: 'desc' },
      include: { salon: { select: { name: true } } },
    });
    return Promise.all(rows.map((row) => this.refresh(row, true)));
  }

  async listForSalon(salonId: string): Promise<ReferralDto[]> {
    const rows = await this.prisma.salonReferral.findMany({
      where: { salonId },
      orderBy: { createdAt: 'desc' },
      include: {
        salon: { select: { name: true } },
        referrer: { select: { fullName: true, phone: true } },
      },
    });
    return Promise.all(rows.map((row) => this.refresh(row, false)));
  }

  async getClaimPreview(token: string): Promise<ReferralDto | null> {
    const row = await this.prisma.salonReferral.findUnique({
      where: { claimToken: token.trim() },
      include: { salon: { select: { name: true } } },
    });
    return row ? this.refresh(row, true) : null;
  }

  async linkSalon(token: string, salonId: string): Promise<void> {
    const row = await this.prisma.salonReferral.findUnique({ where: { claimToken: token.trim() } });
    if (!row) throw new ReferralStateError('NOT_FOUND');
    if (row.salonId && row.salonId !== salonId) throw new ReferralStateError('ALREADY_LINKED');
    if (row.rewardStatus === 'redeemed') return;
    await this.prisma.salonReferral.update({
      where: { id: row.id },
      data: { salonId, status: 'claimed', claimedAt: row.claimedAt ?? new Date() },
    });
  }

  async redeem(referralId: string, salonId: string): Promise<ReferralDto> {
    const row = await this.prisma.salonReferral.findUnique({
      where: { id: referralId },
      include: {
        salon: { select: { name: true } },
        referrer: { select: { fullName: true, phone: true } },
      },
    });
    if (!row) throw new ReferralStateError('NOT_FOUND');
    if (row.salonId !== salonId) throw new ReferralStateError('WRONG_SALON');
    const current = await this.refresh(row, false);
    if (current.rewardStatus !== 'available') throw new ReferralStateError('NOT_REWARDABLE');
    const updated = await this.prisma.salonReferral.update({
      where: { id: referralId },
      data: { rewardStatus: 'redeemed', status: 'redeemed', redeemedAt: new Date() },
      include: {
        salon: { select: { name: true } },
        referrer: { select: { fullName: true, phone: true } },
      },
    });
    return this.toDto(updated, false);
  }

  private async refresh(row: ReferralRow, exposeClaimToken: boolean): Promise<ReferralDto> {
    let current = row;
    if (row.salonId) {
      const qualifyingBookings = await this.prisma.appointment.count({
        where: { salonId: row.salonId, status: 'completed', createdAt: { gte: row.createdAt } },
      });
      const now = new Date();
      const nextStatus =
        qualifyingBookings >= row.requiredBookings
          ? 'reward_available'
          : qualifyingBookings > 0
            ? 'active'
            : 'claimed';
      const data: Record<string, unknown> = {};
      if (row.rewardStatus === 'locked' && qualifyingBookings >= row.requiredBookings) {
        data.status = nextStatus;
        data.qualifyingBookings = qualifyingBookings;
        data.rewardStatus = 'available';
        data.qualifiedAt = now;
        data.rewardExpiresAt = new Date(now.getTime() + REFERRAL_REWARD_DAYS * 86_400_000);
      } else if (
        row.rewardStatus === 'available' &&
        row.rewardExpiresAt &&
        row.rewardExpiresAt.getTime() <= now.getTime()
      ) {
        data.status = 'expired';
        data.qualifyingBookings = qualifyingBookings;
        data.rewardStatus = 'expired';
      } else if (row.qualifyingBookings !== qualifyingBookings || row.status !== nextStatus) {
        data.status = nextStatus;
        data.qualifyingBookings = qualifyingBookings;
      }
      if (Object.keys(data).length > 0) {
        current = await this.prisma.salonReferral.update({
          where: { id: row.id },
          data,
          include: {
            salon: { select: { name: true } },
            referrer: { select: { fullName: true, phone: true } },
          },
        });
      }
    }
    return this.toDto(current, exposeClaimToken);
  }

  private toDto(row: ReferralRow, exposeClaimToken: boolean): ReferralDto {
    return {
      id: row.id,
      salonId: row.salonId,
      salonName: row.salonName,
      salonPhone: row.salonPhone,
      salonInstagram: row.salonInstagram,
      city: row.city,
      ...(exposeClaimToken
        ? { claimToken: row.claimToken, claimUrl: inviteUrl(this.options.publicBaseUrl, row.claimToken) }
        : {}),
      status: row.status,
      qualifyingBookings: row.qualifyingBookings,
      requiredBookings: row.requiredBookings,
      rewardAmountRial: Number(row.rewardAmountRial),
      rewardStatus: row.rewardStatus,
      rewardExpiresAt: row.rewardExpiresAt,
      claimedAt: row.claimedAt,
      qualifiedAt: row.qualifiedAt,
      redeemedAt: row.redeemedAt,
      createdAt: row.createdAt,
      referrerName: row.referrer?.fullName,
      referrerPhone: row.referrer?.phone,
      linkedSalonName: row.salon?.name,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
