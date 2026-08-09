import { randomUUID } from 'crypto';
import type { PrismaClient, Salon, StaffMember } from '@prisma/client';
import { encodeSalonQr, parseSalonQr } from '@salon/shared';
import { RegistrationError } from './registration-error';

/**
 * SalonRegistration handles salon creation with QR token generation,
 * QR payload retrieval, and QR-based salon resolution.
 *
 * - createSalon: generates a unique qr_token on creation (R7.1)
 * - getSalonQrPayload: encodes the salon's qr_token into a QR payload
 * - resolveSalonByQr: resolves a QR payload to a salon, distinguishing
 *   malformed (R7.5) from unregistered (R7.4)
 */
export class SalonRegistration {
  private readonly prisma: PrismaClient;
  /**
   * Optional deep-link base (`<publicBaseUrl>/s/`) for QR encode/parse. When
   * undefined the shared codec default (`https://book.salon.app/s/`) is used.
   * Kept in sync with {@link QrService} so payloads encode and resolve against
   * the same base (e.g. a LAN IP origin in dev).
   */
  private readonly qrDeepLinkBase?: string;

  constructor(prisma: PrismaClient, options: { publicBaseUrl?: string } = {}) {
    this.prisma = prisma;
    this.qrDeepLinkBase = options.publicBaseUrl
      ? `${options.publicBaseUrl.replace(/\/+$/, '')}/s/`
      : undefined;
  }

  /**
   * Create a new salon with a unique qr_token.
   *
   * The qr_token is generated via crypto.randomUUID (R7.1).
   */
  async createSalon(name: string, timezone?: string): Promise<Salon> {
    const qrToken = randomUUID();

    const salon = await this.prisma.salon.create({
      data: {
        name,
        qrToken,
        ...(timezone ? { timezone } : {}),
      },
    });

    return salon;
  }

  /**
   * Self-service salon registration: atomically create the salon, its Owner
   * staff member (whose login `phone` lets them sign in via OTP and receive an
   * Owner token scoped to this salon), and the optional onboarding answers
   * (brand accent, services, chairs) so the panel is pre-filled.
   *
   * Everything is created in a single transaction so a partial salon (e.g. a
   * salon with no owner) is never persisted. The caller starts the free trial
   * (SubscriptionService.startTrial) after this resolves.
   *
   * The `phone` column on staff_member is UNIQUE: a phone already registered to
   * another staff member surfaces as a Prisma P2002 the route maps to 409.
   *
   * @returns the created salon and the id of its Owner staff member.
   */
  async registerSalon(input: {
    salonName: string;
    ownerName: string;
    phone: string;
    timezone?: string;
    brandAccent?: string | null;
    services?: Array<{ name: string; durationMinutes: number; priceRial: number }>;
    chairCount?: number;
  }): Promise<{ salon: Salon; ownerStaffId: string }> {
    const qrToken = randomUUID();
    // Scheduling requires at least one active chair/resource. Never create a
    // salon that looks complete but cannot expose any booking slots.
    const chairCount = Math.min(Math.max(input.chairCount ?? 1, 1), 50);
    const services = (input.services ?? []).slice(0, 50);

    return this.prisma.$transaction(async (tx) => {
      const salon = await tx.salon.create({
        data: {
          name: input.salonName,
          qrToken,
          ...(input.timezone ? { timezone: input.timezone } : {}),
          ...(input.brandAccent ? { brandAccent: input.brandAccent } : {}),
        },
      });

      const owner = await tx.staffMember.create({
        data: {
          salonId: salon.id,
          fullName: input.ownerName,
          role: 'Owner',
          phone: input.phone,
        },
      });

      // Default working hours for the owner (all 7 weekdays, 09:00–20:00) so a
      // freshly-registered salon is immediately bookable. The scheduling engine
      // returns no slots until at least one staff member has working_hours.
      await tx.workingHours.createMany({
        data: Array.from({ length: 7 }, (_, weekday) => ({
          ownerKind: 'staff',
          ownerId: owner.id,
          weekday,
          startTime: new Date('1970-01-01T09:00:00'),
          endTime: new Date('1970-01-01T20:00:00'),
        })),
      });

      // Create the requested services and link each to the owner so the engine
      // can find qualified staff (service_staff is a hard precondition).
      if (services.length > 0) {
        const created = await tx.service.createMany({
          data: services.map((s) => ({
            salonId: salon.id,
            name: s.name,
            durationMin: s.durationMinutes,
            bufferMin: 0,
            priceRial: BigInt(Math.max(0, Math.round(s.priceRial))),
            requiresDeposit: false,
          })),
          // createMany does not return created rows; fetch them next.
        });
        void created;
        const serviceRows = await tx.service.findMany({
          where: { salonId: salon.id },
          select: { id: true },
        });
        await tx.serviceStaff.createMany({
          data: serviceRows.map((s) => ({
            serviceId: s.id,
            staffMemberId: owner.id,
          })),
        });
      }

      // Create the requested chairs and give each default working hours so the
      // engine can find compatible chairs (chair working_hours is also a hard
      // precondition).
      if (chairCount > 0) {
        const chairRows = await tx.chair.createManyAndReturn({
          data: Array.from({ length: chairCount }, (_, i) => ({
            salonId: salon.id,
            name: `صندلی ${i + 1}`,
          })),
        });
        const chairHours: Array<{
          ownerKind: string;
          ownerId: string;
          weekday: number;
          startTime: Date;
          endTime: Date;
        }> = [];
        for (const chair of chairRows) {
          for (let weekday = 0; weekday < 7; weekday += 1) {
            chairHours.push({
              ownerKind: 'chair',
              ownerId: chair.id,
              weekday,
              startTime: new Date('1970-01-01T09:00:00'),
              endTime: new Date('1970-01-01T20:00:00'),
            });
          }
        }
        await tx.workingHours.createMany({ data: chairHours });
      }

      return { salon, ownerStaffId: owner.id };
    });
  }

  /**
   * Get the encoded QR payload for a salon.
   *
   * Returns the deep link string generated by encodeSalonQr from the shared package.
   * Throws if the salon does not exist.
   */
  async getSalonQrPayload(salonId: string): Promise<string> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
    });

    if (!salon) {
      throw new Error(`Salon not found: ${salonId}`);
    }

    return encodeSalonQr(salon.qrToken, this.qrDeepLinkBase);
  }

  /**
   * Resolve a scanned QR payload to a salon.
   *
   * 1. Parse the payload using parseSalonQr from the shared package.
   * 2. If malformed → throw RegistrationError with code QR_MALFORMED (R7.5).
   * 3. If ok → query the salon by qr_token.
   * 4. If not found → throw RegistrationError with code QR_UNREGISTERED (R7.4).
   * 5. If found → return the salon (R7.2).
   */
  async resolveSalonByQr(qrPayload: string): Promise<Salon> {
    const { salon } = await this.resolveQr(qrPayload);
    return salon;
  }

  /**
   * Resolve a scanned QR payload to a salon and, when the payload is a
   * stylist-scoped QR (`encodeStaffQr`), the named staff member too.
   *
   * Mirrors {@link resolveSalonByQr} for malformed/unregistered handling. The
   * staff hint is honored only when the staff member exists and belongs to the
   * resolved salon; otherwise it is ignored and the result is a plain salon
   * resolution (so a stale/foreign staff id degrades gracefully to the salon).
   */
  async resolveQr(
    qrPayload: string,
  ): Promise<{ salon: Salon; staff?: StaffMember }> {
    const parseResult = parseSalonQr(qrPayload, this.qrDeepLinkBase);

    if (parseResult.kind === 'malformed') {
      throw new RegistrationError('QR_MALFORMED');
    }

    const salon = await this.prisma.salon.findUnique({
      where: { qrToken: parseResult.salonToken },
    });

    if (!salon || salon.active === false) {
      throw new RegistrationError('QR_UNREGISTERED');
    }

    if (parseResult.staffId) {
      const member = await this.prisma.staffMember.findUnique({
        where: { id: parseResult.staffId },
      });
      if (member && member.salonId === salon.id) {
        return { salon, staff: member };
      }
    }

    return { salon };
  }

  /**
   * Read a salon's storefront Brand_Accent key (signature-ui-system R4.1, R4.2).
   *
   * Public/anonymous-safe: the booking funnel resolves a salon by id and needs
   * the accent to theme the storefront for any visitor. Returns `null` when the
   * salon has no configured accent (signature default) or does not exist, so the
   * Tenant_Theming_System falls back to the default palette rather than erroring.
   */
  async getSalonBrandAccent(salonId: string): Promise<string | null> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { brandAccent: true },
    });
    return salon?.brandAccent ?? null;
  }

  /**
   * Public brand identity for the storefront funnel: the salon's display name
   * plus its Brand_Accent, in one read. Lets a deep-linked visitor's funnel
   * header show the salon as the primary brand mark (R4.5) without an extra
   * request. Returns nulls for an unknown salon so callers degrade gracefully.
   */
  async getSalonPublicBrand(
    salonId: string,
  ): Promise<{ name: string | null; brandAccent: string | null }> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { name: true, brandAccent: true },
    });
    return {
      name: salon?.name ?? null,
      brandAccent: salon?.brandAccent ?? null,
    };
  }

  /**
   * Reports whether a phone number is already registered to a staff member
   * (and thus already owns a salon). Used by the registration wizard to flag a
   * duplicate phone immediately at Step 1 — instead of bouncing the user all
   * the way back from Submit at Step 3. Public; returns only a boolean.
   */
  async isPhoneTaken(phone: string): Promise<boolean> {
    const staff = await this.prisma.staffMember.findUnique({
      where: { phone },
      select: { id: true },
    });
    return staff !== null;
  }
}
