import type { PrismaClient, StaffMember, Chair, Equipment } from '@prisma/client';
import type { StaffRole } from '@salon/shared';

/**
 * ResourceRegistration handles owner-guarded CRUD for salon resources:
 * staff members, chairs, and equipment.
 *
 * - registerStaffMember: creates a staff member for a salon (R3.1)
 * - registerChair: creates a chair for a salon (R3.2)
 * - registerEquipment: creates equipment for a salon
 */
export class ResourceRegistration {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Register a new staff member for a salon (R3.1).
   *
   * @param salonId - The salon to add the staff member to
   * @param fullName - The staff member's full name
   * @param role - The staff member's role (Owner, Admin, or Stylist)
   * @returns The created StaffMember record
   */
  async registerStaffMember(
    salonId: string,
    fullName: string,
    role: StaffRole,
    phone?: string | null,
  ): Promise<StaffMember> {
    const staffMember = await this.prisma.staffMember.create({
      data: {
        salonId,
        fullName,
        role,
        // A login phone is optional: when set (and unique) it lets that person
        // sign in via OTP and receive a staff JWT with this role (auth.service
        // findStaffClaimsByPhone). Omit to create a non-login staff record.
        ...(phone ? { phone } : {}),
      },
    });

    return staffMember;
  }

  /**
   * Update a staff member's identity / role / login / active flag (owner-guarded
   * at the route layer). Only provided fields are changed. Passing `phone: null`
   * clears the login; a non-empty `phone` sets it (must be unique — a duplicate
   * surfaces as a Prisma P2002 the route maps to 409). Changing `role` is how an
   * owner promotes/demotes a person (e.g. Stylist → Admin).
   */
  async updateStaffMember(
    id: string,
    patch: { fullName?: string; role?: StaffRole; phone?: string | null; active?: boolean },
  ): Promise<StaffMember> {
    return this.prisma.staffMember.update({
      where: { id },
      data: {
        ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
  }

  /**
   * Register a new chair for a salon (R3.2).
   *
   * @param salonId - The salon to add the chair to
   * @param name - The chair's name/identifier
   * @returns The created Chair record
   */
  async registerChair(salonId: string, name: string): Promise<Chair> {
    const chair = await this.prisma.chair.create({
      data: {
        salonId,
        name,
      },
    });

    return chair;
  }

  /**
   * Register new equipment for a salon.
   *
   * @param salonId - The salon to add the equipment to
   * @param name - The equipment name
   * @returns The created Equipment record
   */
  async registerEquipment(salonId: string, name: string): Promise<Equipment> {
    const equipment = await this.prisma.equipment.create({
      data: {
        salonId,
        name,
      },
    });

    return equipment;
  }

  /**
   * List all staff members for a salon (read-only). Used by the RBAC-guarded
   * `GET /salons/:id/staff` route (Requirement 2.2).
   */
  async listStaff(salonId: string): Promise<StaffMember[]> {
    return this.prisma.staffMember.findMany({
      where: { salonId },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * List a salon's bookable staff — the people a customer can pick as their
   * stylist in the public booking funnel. Limited to service-performing roles
   * (Owner, Stylist); back-office Admins are excluded. Public (no RBAC), so the
   * funnel can offer a stylist picker after a salon QR scan.
   */
  async listBookableStaff(salonId: string): Promise<StaffMember[]> {
    return this.prisma.staffMember.findMany({
      where: { salonId, role: { in: ['Owner', 'Stylist'] } },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * List all chairs for a salon (read-only). Used by the RBAC-guarded
   * `GET /salons/:id/chairs` route (Requirement 2.2).
   */
  async listChairs(salonId: string): Promise<Chair[]> {
    return this.prisma.chair.findMany({
      where: { salonId },
      orderBy: { name: 'asc' },
    });
  }
}
