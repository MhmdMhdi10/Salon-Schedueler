/**
 * Feature: salon-booking-system, Property 15: Role-based authorization matrix
 *
 * For any staff account role and any action, authorization matches the defined matrix:
 * an Owner is always permitted to configure the salon and to manage appointments;
 * an Admin is permitted to manage appointments but not to change salon configuration;
 * a Stylist is permitted to view only their own assigned appointments and customer notes
 * and is denied configuration changes (leaving configuration unchanged).
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 14.4
 */

import * as fc from 'fast-check';
import { Authorizer, type Action, type Principal, type ResourceRef } from './authorizer';

// --- Generators ---

/** All possible actions in the system */
const allActions: Action[] = [
  'configure_salon',
  'manage_appointments',
  'view_own_appointments',
  'view_customer_notes',
];

const actionArb: fc.Arbitrary<Action> = fc.constantFrom(...allActions);

/** Random staff member IDs */
const staffMemberIdArb = fc.uuid();

/** Generate a Principal with a specific role and random staffMemberId */
const ownerPrincipalArb: fc.Arbitrary<Principal> = staffMemberIdArb.map((staffMemberId) => ({
  id: `owner-${staffMemberId}`,
  role: 'Owner' as const,
  staffMemberId,
}));

const adminPrincipalArb: fc.Arbitrary<Principal> = staffMemberIdArb.map((staffMemberId) => ({
  id: `admin-${staffMemberId}`,
  role: 'Admin' as const,
  staffMemberId,
}));

const stylistPrincipalArb: fc.Arbitrary<Principal> = staffMemberIdArb.map((staffMemberId) => ({
  id: `stylist-${staffMemberId}`,
  role: 'Stylist' as const,
  staffMemberId,
}));

/** Generate a ResourceRef with a random staffMemberId */
const resourceRefArb: fc.Arbitrary<ResourceRef> = fc.record({
  salonId: fc.option(fc.uuid(), { nil: undefined }),
  staffMemberId: fc.option(fc.uuid(), { nil: undefined }),
});

const resourceRefWithStaffArb: fc.Arbitrary<ResourceRef> = staffMemberIdArb.map((staffMemberId) => ({
  salonId: undefined,
  staffMemberId,
}));

// --- Property Tests ---

describe('Property 15: Role-based authorization matrix', () => {
  const authorizer = new Authorizer();

  describe('Owner: always allow all actions regardless of resource (R2.2, R2.3, R2.5, R2.6)', () => {
    it('Owner is permitted every action for any resource', () => {
      fc.assert(
        fc.property(ownerPrincipalArb, actionArb, resourceRefArb, (principal, action, resource) => {
          const result = authorizer.can(principal, action, resource);
          return result === true;
        }),
        { numRuns: 100 },
      );
    });

    it('Owner retains configure_salon access regardless of system state (R2.6)', () => {
      fc.assert(
        fc.property(ownerPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'configure_salon', resource) === true;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Admin: deny configure_salon, allow rest regardless of resource (R2.3)', () => {
    it('Admin is denied configure_salon', () => {
      fc.assert(
        fc.property(adminPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'configure_salon', resource) === false;
        }),
        { numRuns: 100 },
      );
    });

    it('Admin is permitted manage_appointments', () => {
      fc.assert(
        fc.property(adminPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'manage_appointments', resource) === true;
        }),
        { numRuns: 100 },
      );
    });

    it('Admin is permitted view_own_appointments for any resource', () => {
      fc.assert(
        fc.property(adminPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'view_own_appointments', resource) === true;
        }),
        { numRuns: 100 },
      );
    });

    it('Admin is permitted view_customer_notes (R14.4)', () => {
      fc.assert(
        fc.property(adminPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'view_customer_notes', resource) === true;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Stylist: restricted access with ownership checks (R2.4, R2.5, R14.4)', () => {
    it('Stylist is denied configure_salon (R2.4)', () => {
      fc.assert(
        fc.property(stylistPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'configure_salon', resource) === false;
        }),
        { numRuns: 100 },
      );
    });

    it('Stylist is denied manage_appointments', () => {
      fc.assert(
        fc.property(stylistPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'manage_appointments', resource) === false;
        }),
        { numRuns: 100 },
      );
    });

    it('Stylist is permitted view_customer_notes (R14.4)', () => {
      fc.assert(
        fc.property(stylistPrincipalArb, resourceRefArb, (principal, resource) => {
          return authorizer.can(principal, 'view_customer_notes', resource) === true;
        }),
        { numRuns: 100 },
      );
    });

    it('Stylist is permitted view_own_appointments only when principal.staffMemberId === resource.staffMemberId', () => {
      fc.assert(
        fc.property(stylistPrincipalArb, resourceRefWithStaffArb, (principal, resource) => {
          const result = authorizer.can(principal, 'view_own_appointments', resource);
          const isOwnResource = principal.staffMemberId === resource.staffMemberId;
          return result === isOwnResource;
        }),
        { numRuns: 100 },
      );
    });

    it('Stylist is denied view_own_appointments when resource has different staffMemberId', () => {
      fc.assert(
        fc.property(
          stylistPrincipalArb,
          staffMemberIdArb,
          (principal, otherStaffId) => {
            // Ensure they differ
            fc.pre(principal.staffMemberId !== otherStaffId);
            const resource: ResourceRef = { staffMemberId: otherStaffId };
            return authorizer.can(principal, 'view_own_appointments', resource) === false;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Stylist is allowed view_own_appointments when resource.staffMemberId matches', () => {
      fc.assert(
        fc.property(stylistPrincipalArb, (principal) => {
          const resource: ResourceRef = { staffMemberId: principal.staffMemberId };
          return authorizer.can(principal, 'view_own_appointments', resource) === true;
        }),
        { numRuns: 100 },
      );
    });
  });
});
