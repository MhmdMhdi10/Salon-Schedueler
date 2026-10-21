import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationPermissionPrompt } from '../NotificationPermissionPrompt';
import '../../i18n';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', isStaff: true, isPlatformAdmin: false }),
}));

function installNotificationApi(
  permission: NotificationPermission = 'default',
  requestPermission = vi.fn().mockResolvedValue('granted' as NotificationPermission),
) {
  vi.stubGlobal('Notification', { permission, requestPermission });
  vi.stubGlobal('isSecureContext', true);
  return requestPermission;
}

function renderPrompt(pathname = '/account') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <NotificationPermissionPrompt />
    </MemoryRouter>,
  );
}

describe('NotificationPermissionPrompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for an explicit user click before requesting permission', async () => {
    const requestPermission = installNotificationApi();
    renderPrompt();

    const dialog = await screen.findByRole('dialog', { name: 'اعلان‌های مهم آرا' });
    expect(dialog).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'فعال‌سازی اعلان‌ها' }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not request permission when the user chooses later', async () => {
    const requestPermission = installNotificationApi();
    renderPrompt();

    await screen.findByRole('dialog', { name: 'اعلان‌های مهم آرا' });
    fireEvent.click(screen.getByRole('button', { name: 'بعداً' }));

    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show on public surfaces or after permission was denied', async () => {
    installNotificationApi('denied');
    renderPrompt('/about');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
