import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import { saveSalon } from '../../utils/savedSalons';
import { MySalonsPage } from '../MySalonsPage';

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <MySalonsPage />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe('MySalonsPage', () => {
  it('shows an honest empty state before any QR scan', () => {
    renderPage();
    expect(screen.getByText('هنوز سالنی ذخیره نشده')).toBeInTheDocument();
  });

  it('lists saved salons and links directly to booking', () => {
    saveSalon({ id: 'salon-1', name: 'سالن رز', staffId: 'staff-1', staffName: 'مریم' });
    renderPage();

    expect(screen.getByText('سالن رز')).toBeInTheDocument();
    expect(screen.getByText('با مریم')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /نوبت/ })).toHaveAttribute(
      'href',
      '/salon/salon-1/book?staff=staff-1',
    );
  });

  it('lets the user remove a saved salon', () => {
    saveSalon({ id: 'salon-1', name: 'سالن رز' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'حذف سالن رز' }));
    expect(screen.getByText('هنوز سالنی ذخیره نشده')).toBeInTheDocument();
  });
});
