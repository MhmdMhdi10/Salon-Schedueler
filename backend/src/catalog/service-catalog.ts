import type { PrismaClient, Service } from '@prisma/client';
import { ServiceInputSchema, type ServiceInput } from '@salon/shared';
import { ValidationError } from './validation-error';
import type { FieldError } from './validation-error';

export type ServiceWithStaff = Service & {
  serviceStaff: Array<{ serviceId: string; staffMemberId: string }>;
};

/**
 * ServiceCatalog manages the creation and querying of services for a salon.
 *
 * - Validates input using the shared Zod schema (R5.3, R5.4)
 * - Persists services via Prisma, converting Rial amounts to BigInt
 * - Returns structured validation errors with field-level details
 * - Manages service-to-staff and service-to-equipment mappings (R6.1, R6.3)
 */
export class ServiceCatalog {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new service for a salon.
   *
   * 1. Validate input against ServiceInputSchema
   * 2. Throw ValidationError with field-level errors if invalid (R5.3, R5.4)
   * 3. Persist via Prisma (convert priceRial/depositRial to BigInt)
   * 4. Return the created Service
   */
  async createService(input: ServiceInput): Promise<Service> {
    // Validate with the shared Zod schema
    const result = ServiceInputSchema.safeParse(input);

    if (!result.success) {
      const fieldErrors: FieldError[] = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ValidationError(fieldErrors);
    }

    const validated = result.data;

    // Persist via Prisma, converting Rial amounts to BigInt
    const service = await this.prisma.service.create({
      data: {
        salonId: validated.salonId,
        name: validated.name,
        durationMin: validated.durationMinutes,
        durationMode: validated.durationMode ?? 'fixed',
        minDurationMin:
          validated.durationMode === 'variable'
            ? validated.minDurationMinutes ?? validated.durationMinutes
            : null,
        maxDurationMin:
          validated.durationMode === 'variable'
            ? validated.maxDurationMinutes ?? validated.minDurationMinutes ?? validated.durationMinutes
            : null,
        bufferMin: validated.bufferMinutes,
        priceRial: BigInt(validated.priceRial),
        requiresDeposit: validated.requiresDeposit,
        depositRial: validated.depositRial != null ? BigInt(validated.depositRial) : null,
        depositType: validated.depositType ?? 'fixed',
        depositPercent: validated.depositType === 'percentage' ? validated.depositPercent ?? null : null,
        approvalStaffId: validated.approvalStaffId ?? null,
      },
    });

    return service;
  }

  /**
   * List all services for a salon (read-only). Used by the public
   * `GET /salons/:id/services` route (Requirement 2.2). Returns the persisted
   * Service rows; the HTTP layer maps them to the client-facing shape.
   */
  async listServices(salonId: string): Promise<ServiceWithStaff[]> {
    return this.prisma.service.findMany({
      where: { salonId, deletedAt: null },
      include: { serviceStaff: { select: { serviceId: true, staffMemberId: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateService(
    serviceId: string,
    patch: {
      name?: string;
      durationMinutes?: number;
      bufferMinutes?: number;
      priceRial?: number;
      requiresDeposit?: boolean;
      depositRial?: number | null;
      durationMode?: 'fixed' | 'variable';
      minDurationMinutes?: number | null;
      maxDurationMinutes?: number | null;
      depositType?: 'fixed' | 'percentage';
      depositPercent?: number | null;
      approvalStaffId?: string | null;
    },
  ): Promise<ServiceWithStaff> {
    return this.prisma.service.update({
      where: { id: serviceId },
      include: { serviceStaff: { select: { serviceId: true, staffMemberId: true } } },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.durationMinutes !== undefined
          ? { durationMin: patch.durationMinutes }
          : {}),
        ...(patch.bufferMinutes !== undefined ? { bufferMin: patch.bufferMinutes } : {}),
        ...(patch.priceRial !== undefined ? { priceRial: BigInt(patch.priceRial) } : {}),
        ...(patch.requiresDeposit !== undefined
          ? { requiresDeposit: patch.requiresDeposit }
          : {}),
        ...(patch.depositRial !== undefined
          ? { depositRial: patch.depositRial == null ? null : BigInt(patch.depositRial) }
          : {}),
        ...(patch.durationMode !== undefined ? { durationMode: patch.durationMode } : {}),
        ...(patch.minDurationMinutes !== undefined
          ? { minDurationMin: patch.minDurationMinutes }
          : {}),
        ...(patch.maxDurationMinutes !== undefined
          ? { maxDurationMin: patch.maxDurationMinutes }
          : {}),
        ...(patch.depositType !== undefined ? { depositType: patch.depositType } : {}),
        ...(patch.depositPercent !== undefined
          ? { depositPercent: patch.depositPercent }
          : {}),
        ...(patch.approvalStaffId !== undefined
          ? { approvalStaffId: patch.approvalStaffId }
          : {}),
      },
    });
  }

  /**
   * Replace the set of qualified staff members for a service (R6.1).
   *
   * Atomically deletes all existing service_staff entries for the service
   * and creates new ones for the provided staffIds.
   * Wrapped in a Prisma transaction for atomicity.
   */
  async setServiceStaff(serviceId: string, staffIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Remove all existing staff mappings for this service
      await tx.serviceStaff.deleteMany({
        where: { serviceId },
      });

      // Create new mappings (skip if staffIds is empty)
      if (staffIds.length > 0) {
        await tx.serviceStaff.createMany({
          data: staffIds.map((staffMemberId) => ({
            serviceId,
            staffMemberId,
          })),
        });
      }
    });
  }

  /** Add qualified staff without removing existing mappings (onboarding/MVP default). */
  async addServiceStaff(serviceId: string, staffIds: string[]): Promise<void> {
    if (staffIds.length === 0) return;
    await this.prisma.serviceStaff.createMany({
      data: staffIds.map((staffMemberId) => ({ serviceId, staffMemberId })),
      skipDuplicates: true,
    });
  }

  /**
   * Replace the set of required equipment for a service (R6.3).
   *
   * Atomically deletes all existing service_equipment entries for the service
   * and creates new ones for the provided equipmentIds.
   * Wrapped in a Prisma transaction for atomicity.
   */
  async setServiceEquipment(serviceId: string, equipmentIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Remove all existing equipment mappings for this service
      await tx.serviceEquipment.deleteMany({
        where: { serviceId },
      });

      // Create new mappings (skip if equipmentIds is empty)
      if (equipmentIds.length > 0) {
        await tx.serviceEquipment.createMany({
          data: equipmentIds.map((equipmentId) => ({
            serviceId,
            equipmentId,
          })),
        });
      }
    });
  }

  /**
   * Delete a service and all its staff/equipment mappings. Cascading deletes
   * are not enabled on the join-table foreign keys, so remove mappings first
   * in one transaction before deleting the service row.
   */
  async deleteService(serviceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceStaff.deleteMany({ where: { serviceId } });
      await tx.serviceEquipment.deleteMany({ where: { serviceId } });
      // Keep historical appointments and audit trails intact. The fallback is
      // only for old lightweight test doubles that predate soft delete.
      if (typeof (tx.service as any).update === 'function') {
        await tx.service.update({ where: { id: serviceId }, data: { deletedAt: new Date() } });
      } else {
        await tx.service.delete({ where: { id: serviceId } });
      }
    });
  }
}
