import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../auth/AuthContext';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import '../../../i18n';

const mockGetMe = vi.hoisted(() => vi.fn());

vi.mock('../../../api/client', () => ({
  bootstrapAuth: vi.fn().mockResolvedValue(true),
  getAccessToken: vi.fn().mockReturnValue('access-token'),
  meApi: { getMe: mockGetMe },
  signOut: vi.fn(),
}));

function renderSwitcher(path: string, principal: Record<string, unknown>) {
  mockGetMe.mockResolvedValue({ principal });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <WorkspaceSwitcher testId="workspace-switcher" />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => mockGetMe.mockReset());

  it('takes staff from customer-facing routes to the salon panel', async () => {
    renderSwitcher('/account', { id: 'customer-1', role: 'Stylist', salonId: 'salon-1' });

    const nav = await screen.findByTestId('workspace-switcher');
    expect(nav.querySelector('a')).toHaveAttribute('href', '/owner');
    expect(screen.getByText('پنل سالن')).toBeInTheDocument();
  });

  it('takes staff from the salon panel to their customer panel', async () => {
    mockGetMe.mockResolvedValue({
      principal: { id: 'customer-1', role: 'Owner', salonId: 'salon-1' },
    });
    render(
      <MemoryRouter initialEntries={['/owner/calendar']}>
        <AuthProvider>
          <WorkspaceSwitcher surface="owner" testId="workspace-switcher" />
        </AuthProvider>
      </MemoryRouter>,
    );

    const nav = await screen.findByTestId('workspace-switcher');
    expect(nav.querySelector('a')).toHaveAttribute('href', '/account');
    expect(screen.getByText('پنل کاربری')).toBeInTheDocument();
  });

  it('shows salon registration to a customer without a salon', async () => {
    renderSwitcher('/account', { id: 'customer-1' });

    const nav = await screen.findByTestId('workspace-switcher');
    expect(nav.querySelector('a')).toHaveAttribute('href', '/business/register');
    expect(screen.getByText('ثبت سالن')).toBeInTheDocument();
  });
});
