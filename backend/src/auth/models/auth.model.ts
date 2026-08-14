import type { Otp, PlatformAdmin, StaffMember } from '@prisma/client';

export type AuthModel = Otp | StaffMember | PlatformAdmin;
