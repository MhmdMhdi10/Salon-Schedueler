import { PlatformAdminError, PlatformAdminService } from './platform-admin.service.js';

const customer = {
  id: '00000000-0000-4000-8000-000000000001',
  phone: '09123456789',
  fullName: 'مشتری آزمایشی',
  noShowCount: 0,
  active: true,
  deletedAt: null,
};

function customerPrisma() {
  const current = { ...customer };
  return {
    customer: {
      findUnique: jest.fn().mockImplementation(async () => ({
        ...current,
        _count: { appointments: 0, waitlistEntries: 0 },
      })),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(current, data);
        return { ...current };
      }),
    },
    platformAuditLog: { create: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe('PlatformAdminService lifecycle controls', () => {
  it('blocks, soft-deletes and restores a customer without deleting history', async () => {
    const prisma = customerPrisma();
    const service = new PlatformAdminService(prisma);

    await service.setCustomerActive(customer.id, false, 'admin-1');
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: customer.id },
      data: { active: false },
    });

    await service.deleteCustomer(customer.id, 'admin-1');
    expect(prisma.customer.update).toHaveBeenLastCalledWith({
      where: { id: customer.id },
      data: { active: false, deletedAt: expect.any(Date) },
    });

    await service.setCustomerActive(customer.id, true, 'admin-1');
    expect(prisma.customer.update).toHaveBeenLastCalledWith({
      where: { id: customer.id },
      data: { active: true, deletedAt: null },
    });
    expect(prisma.platformAuditLog.create).toHaveBeenCalledTimes(3);
  });

  it('does not allow removing the last active owner of a salon', async () => {
    const prisma = {
      staffMember: {
        findUnique: jest.fn().mockResolvedValue({ salonId: 'salon-1', role: 'Owner', active: true, deletedAt: null }),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const service = new PlatformAdminService(prisma);

    await expect(service.deleteStaff('00000000-0000-4000-8000-000000000002', 'admin-1')).rejects.toMatchObject<Partial<PlatformAdminError>>({
      code: 'INVALID_STATE',
      message: 'LAST_OWNER_REQUIRED',
    });
  });
});
