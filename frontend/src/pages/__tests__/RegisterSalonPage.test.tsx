import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';

vi.mock('../../api/client', () => {
  class ApiError extends Error {
    code = '';
  }

  return {
    ApiError,
    authApi: {
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
    },
    registrationApi: {
      registerSalon: vi.fn(),
    },
    setAccessToken: vi.fn(),
  };
});

import { RegisterSalonPage } from '../business/RegisterSalonPage';
import { ThemeProvider } from '../../components/theme/ThemeProvider';
import { ToastProvider } from '../../components/ui/Toast';

const originalScrollTo = window.scrollTo;

function renderRegister() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/business/register']}>
        <ThemeProvider defaultTheme="light">
          <ToastProvider>
            <RegisterSalonPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

async function reachServicesStep() {
  renderRegister();

  fireEvent.click(screen.getByTestId('work-mode-starting'));
  fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
  await screen.findByRole('heading', { level: 1, name: 'برای شروع چه شرایطی دارید؟' });
  fireEvent.click(screen.getByRole('button', { name: 'رد کردن این مرحله' }));

  await screen.findByRole('heading', { level: 1, name: 'حوزه کاری‌تان چیست؟' });
  fireEvent.click(screen.getByRole('button', { name: 'رد کردن این مرحله' }));

  const salonName = await screen.findByLabelText('نام سالن');
  fireEvent.change(salonName, { target: { value: 'سالن رز' } });
  fireEvent.change(screen.getByLabelText('نام شما (مدیر سالن)'), {
    target: { value: 'سارا محمدی' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

  return screen.findByTestId('register-services-step');
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  window.scrollTo = originalScrollTo;
  cleanup();
});

describe('RegisterSalonPage services step', () => {
  it('keeps add service action attached to its form and edits a custom service inline', async () => {
    const step = await reachServicesStep();
    const addForm = within(step).getByTestId('add-service-form');

    expect(within(addForm).getByRole('button', { name: 'افزودن خدمت' })).toBeInTheDocument();

    fireEvent.change(within(addForm).getByLabelText('نام خدمت'), {
      target: { value: 'کوتاهی ویژه' },
    });
    fireEvent.change(within(addForm).getByLabelText(/مدت/), { target: { value: '۴۵' } });
    fireEvent.change(within(addForm).getByLabelText(/هزینه/), { target: { value: '۲۵۰۰۰۰' } });
    fireEvent.submit(addForm);

    expect(await within(step).findByText('کوتاهی ویژه')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش کوتاهی ویژه' }));

    const editForm = within(step).getByTestId(/edit-service-/);
    fireEvent.change(within(editForm).getByLabelText('نام خدمت'), {
      target: { value: 'کوتاهی کلاسیک' },
    });
    fireEvent.click(within(editForm).getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(await within(step).findByText('کوتاهی کلاسیک')).toBeInTheDocument();
    expect(within(step).queryByText('کوتاهی ویژه')).not.toBeInTheDocument();
  });

  it('keeps preset selection linked while allowing its saved service to be edited', async () => {
    const step = await reachServicesStep();
    const preset = within(step).getByRole('checkbox', { name: 'کوتاهی مو' });

    fireEvent.click(preset);
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش کوتاهی مو' }));

    const editForm = within(step).getByTestId('edit-service-preset-haircut');
    fireEvent.change(within(editForm).getByLabelText('نام خدمت'), {
      target: { value: 'کوتاهی VIP' },
    });
    fireEvent.click(within(editForm).getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(await within(step).findByText('کوتاهی VIP')).toBeInTheDocument();
    expect(preset).toBeChecked();
    expect(screen.getByRole('button', { name: 'ویرایش کوتاهی VIP' })).toBeInTheDocument();
  });
});
