import { Authorizer, type Principal, type ResourceRef, type Action } from './authorizer';

describe('Authorizer', () => {
  let authorizer: Authorizer;

  beforeEach(() => {
    authorizer = new Authorizer();
  });

  // Helper to create principals
  const owner = (staffMemberId?: string): Principal => ({
    id: 'owner-account-1',
    role: 'Owner',
    staffMemberId: staffMemberId ?? 'staff-owner-1',
  });

  const admin = (staffMemberId?: string): Principal => ({
    id: 'admin-account-1',
    role: 'Admin',
    staffMemberId: staffMemberId ?? 'staff-admin-1',
  });

  const stylist = (staffMemberId?: string): Principal => ({
    id: 'stylist-account-1',
    role: 'Stylist',
    staffMemberId: staffMemberId ?? 'staff-stylist-1',
  });

  const resource = (staffMemberId?: string): ResourceRef => ({
    salonId: 'salon-1',
    staffMemberId,
  });

  describe('Owner role (R2.2, R2.3, R2.5, R2.6)', () => {
    it('should allow configure_salon (R2.2)', () => {
      expect(authorizer.can(owner(), 'configure_salon')).toBe(true);
    });

    it('should allow manage_appointments (R2.3)', () => {
      expect(authorizer.can(owner(), 'manage_appointments')).toBe(true);
    });

    it('should allow view_own_appointments (R2.5)', () => {
      expect(authorizer.can(owner(), 'view_own_appointments', resource('staff-owner-1'))).toBe(true);
    });

    it('should allow view_own_appointments even for other staff (owner has full access)', () => {
      expect(authorizer.can(owner(), 'view_own_appointments', resource('staff-other'))).toBe(true);
    });

    it('should allow view_customer_notes (R14.4)', () => {
      expect(authorizer.can(owner(), 'view_customer_notes')).toBe(true);
    });

    it('should always allow configure_salon regardless of system state (R2.6)', () => {
      // R2.6: Owner retains Salon configuration access regardless of system state
      // This is a structural guarantee — Owner always gets true for configure_salon
      expect(authorizer.can(owner(), 'configure_salon', {})).toBe(true);
      expect(authorizer.can(owner(), 'configure_salon', resource('any-staff'))).toBe(true);
    });
  });

  describe('Admin role (R2.3, R2.4 by omission)', () => {
    it('should deny configure_salon', () => {
      expect(authorizer.can(admin(), 'configure_salon')).toBe(false);
    });

    it('should allow manage_appointments (R2.3)', () => {
      expect(authorizer.can(admin(), 'manage_appointments')).toBe(true);
    });

    it('should allow view_own_appointments', () => {
      expect(authorizer.can(admin(), 'view_own_appointments', resource('staff-admin-1'))).toBe(true);
    });

    it('should allow view_own_appointments for any staff (admin has broad view)', () => {
      expect(authorizer.can(admin(), 'view_own_appointments', resource('staff-other'))).toBe(true);
    });

    it('should allow view_customer_notes (R14.4)', () => {
      expect(authorizer.can(admin(), 'view_customer_notes')).toBe(true);
    });
  });

  describe('Stylist role (R2.4, R2.5)', () => {
    it('should deny configure_salon (R2.4)', () => {
      expect(authorizer.can(stylist(), 'configure_salon')).toBe(false);
    });

    it('should deny manage_appointments', () => {
      expect(authorizer.can(stylist(), 'manage_appointments')).toBe(false);
    });

    it('should allow view_own_appointments for own staff member (R2.5)', () => {
      expect(
        authorizer.can(stylist('staff-stylist-1'), 'view_own_appointments', resource('staff-stylist-1')),
      ).toBe(true);
    });

    it('should deny view_own_appointments for other staff member (R2.5 own only)', () => {
      expect(
        authorizer.can(stylist('staff-stylist-1'), 'view_own_appointments', resource('staff-other')),
      ).toBe(false);
    });

    it('should deny view_own_appointments when resource has no staffMemberId', () => {
      expect(authorizer.can(stylist(), 'view_own_appointments', resource())).toBe(false);
    });

    it('should deny view_own_appointments when principal has no staffMemberId', () => {
      const noStaffPrincipal: Principal = {
        id: 'stylist-account-1',
        role: 'Stylist',
        staffMemberId: undefined,
      };
      expect(
        authorizer.can(noStaffPrincipal, 'view_own_appointments', resource('staff-stylist-1')),
      ).toBe(false);
    });

    it('should allow view_customer_notes (R14.4)', () => {
      expect(authorizer.can(stylist(), 'view_customer_notes')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should default resource to empty object when not provided', () => {
      // Owner still gets access
      expect(authorizer.can(owner(), 'view_own_appointments')).toBe(true);
      // Stylist denied because no resource.staffMemberId for ownership check
      expect(authorizer.can(stylist(), 'view_own_appointments')).toBe(false);
    });

    it('should handle all actions for each role systematically', () => {
      const actions: Action[] = [
        'configure_salon',
        'manage_appointments',
        'view_own_appointments',
        'view_customer_notes',
      ];

      // Owner: all allowed
      for (const action of actions) {
        expect(authorizer.can(owner(), action, resource('staff-owner-1'))).toBe(true);
      }

      // Admin: configure_salon denied, rest allowed
      expect(authorizer.can(admin(), 'configure_salon')).toBe(false);
      expect(authorizer.can(admin(), 'manage_appointments')).toBe(true);
      expect(authorizer.can(admin(), 'view_own_appointments', resource('any'))).toBe(true);
      expect(authorizer.can(admin(), 'view_customer_notes')).toBe(true);

      // Stylist: only view_customer_notes and own appointments
      expect(authorizer.can(stylist('s1'), 'configure_salon')).toBe(false);
      expect(authorizer.can(stylist('s1'), 'manage_appointments')).toBe(false);
      expect(authorizer.can(stylist('s1'), 'view_own_appointments', resource('s1'))).toBe(true);
      expect(authorizer.can(stylist('s1'), 'view_own_appointments', resource('s2'))).toBe(false);
      expect(authorizer.can(stylist('s1'), 'view_customer_notes')).toBe(true);
    });
  });
});
