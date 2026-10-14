import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { authApi, customerApi, registrationApi } from '../../api/client';

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
    customerApi: {
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
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

async function reachServicesStep(profile = 'barber') {
  renderRegister();

  await screen.findByRole('heading', { level: 1, name: 'حوزه کاری‌تان چیست؟' });
  fireEvent.click(screen.getByTestId(`business-type-${profile}`));
  fireEvent.click(screen.getByRole('button', { name: /^ادامه$/ }));

  const salonName = await screen.findByLabelText('نام سالن');
  fireEvent.change(salonName, { target: { value: 'سالن رز' } });
  fireEvent.change(screen.getByLabelText('نام شما (مدیر سالن)'), {
    target: { value: 'سارا محمدی' },
  });
  fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: '09123456789' } });
  fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

  return screen.findByTestId('register-services-step');
}

async function reachInfoStep() {
  renderRegister();

  await screen.findByRole('heading', { level: 1, name: 'حوزه کاری‌تان چیست؟' });
  fireEvent.click(screen.getByTestId('business-type-barber'));
  fireEvent.click(screen.getByRole('button', { name: /^ادامه$/ }));

  return screen.findByLabelText('نام سالن');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  window.scrollTo = originalScrollTo;
  cleanup();
});

describe('RegisterSalonPage services step', () => {
  it('registers after four concise steps without requiring a service or repeated phone entry', async () => {
    await reachServicesStep();
    expect(screen.getByText('مرحله ۳ از ۴')).toBeInTheDocument();
    vi.mocked(registrationApi.registerSalon).mockResolvedValueOnce({} as never);
    vi.mocked(authApi.requestOtp).mockResolvedValueOnce({} as never);

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سالن و دریافت کد' }));

    expect(await screen.findByText('مرحله ۴ از ۴')).toBeInTheDocument();
    expect(registrationApi.registerSalon).toHaveBeenCalledWith(expect.objectContaining({
      phone: '09123456789',
      services: [],
    }));
  });

  it('retries OTP delivery without registering the salon again', async () => {
    await reachServicesStep();
    vi.mocked(registrationApi.registerSalon).mockResolvedValueOnce({} as never);
    vi.mocked(authApi.requestOtp)
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({} as never);

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سالن و دریافت کد' }));
    expect(await screen.findByText('ارسال کد ناموفق بود — دوباره تلاش کنید.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت سالن و دریافت کد' }));

    expect(await screen.findByText('مرحله ۴ از ۴')).toBeInTheDocument();
    expect(registrationApi.registerSalon).toHaveBeenCalledTimes(1);
    expect(authApi.requestOtp).toHaveBeenCalledTimes(2);
  });

  it('reuses the verified owner name for an empty customer profile', async () => {
    await reachServicesStep();
    vi.mocked(registrationApi.registerSalon).mockResolvedValueOnce({} as never);
    vi.mocked(authApi.requestOtp).mockResolvedValueOnce({ devOtp: '1234' } as never);
    vi.mocked(authApi.verifyOtp).mockResolvedValueOnce({ accessToken: 'test-token' } as never);
    vi.mocked(customerApi.getProfile).mockResolvedValueOnce({ customer: { fullName: null } } as never);
    vi.mocked(customerApi.updateProfile).mockResolvedValueOnce({} as never);

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سالن و دریافت کد' }));

    await waitFor(() => expect(customerApi.updateProfile).toHaveBeenCalledWith('سارا محمدی'));
  });
  it('lets the user go back from the salon information step', async () => {
    await reachInfoStep();

    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'حوزه کاری‌تان چیست؟' }),
    ).toBeInTheDocument();
  });

  it('keeps custom service creation and editing inside the service sheet', async () => {
    const step = await reachServicesStep();
    fireEvent.click(within(step).getByRole('button', { name: /^افزودن خدمت$/ }));
    const catalog = await screen.findByRole('dialog');
    fireEvent.click(within(catalog).getByRole('button', { name: 'ساخت خدمت دلخواه' }));
    const addForm = await within(catalog).findByTestId('add-service-form');

    expect(within(addForm).getByRole('button', { name: 'افزودن خدمت' })).toBeInTheDocument();

    fireEvent.change(within(addForm).getByLabelText('نام خدمت'), {
      target: { value: 'کوتاهی ویژه' },
    });
    const durationControl = within(addForm).getByRole('group', { name: /مدت/ });
    const increaseDuration = within(durationControl).getByRole('button', { name: 'افزایش ۱۵ دقیقه' });
    const decreaseDuration = within(durationControl).getByRole('button', { name: 'کاهش ۱۵ دقیقه' });
    fireEvent.click(increaseDuration);
    expect(within(durationControl).getByText('۴۵')).toBeInTheDocument();
    fireEvent.click(increaseDuration);
    expect(within(durationControl).getByText('۶۰')).toBeInTheDocument();
    fireEvent.click(decreaseDuration);
    expect(within(durationControl).getByText('۴۵')).toBeInTheDocument();
    fireEvent.change(within(addForm).getByLabelText(/هزینه/), { target: { value: '۲۵۰۰۰۰' } });
    expect(within(addForm).getByLabelText(/هزینه/)).toHaveValue('250,000');
    fireEvent.submit(addForm);

    expect(await within(step).findByText('کوتاهی ویژه')).toBeInTheDocument();
    fireEvent.click(within(catalog).getByRole('button', { name: 'تمام شد' }));
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش کوتاهی ویژه' }));

    const editForm = screen.getByTestId(/edit-service-/);
    fireEvent.change(within(editForm).getByLabelText('نام خدمت'), {
      target: { value: 'کوتاهی کلاسیک' },
    });
    fireEvent.click(within(editForm).getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(await within(step).findByText('کوتاهی کلاسیک')).toBeInTheDocument();
    expect(within(step).queryByText('کوتاهی ویژه')).not.toBeInTheDocument();
  });

  it('keeps preset selection linked while allowing its saved service to be edited', async () => {
    const step = await reachServicesStep('hair_salon');
    fireEvent.click(within(step).getByRole('button', { name: /^افزودن خدمت$/ }));
    const catalog = await screen.findByRole('dialog');
    fireEvent.click(within(catalog).getByRole('button', { name: 'کوتاهی مو' }));
    fireEvent.click(within(catalog).getByRole('button', { name: 'تمام شد' }));
    fireEvent.click(screen.getByRole('button', { name: 'ویرایش کوتاهی مو' }));

    const editForm = screen.getByTestId('edit-service-preset-haircut');
    fireEvent.change(within(editForm).getByLabelText('نام خدمت'), {
      target: { value: 'کوتاهی VIP' },
    });
    fireEvent.click(within(editForm).getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(await within(step).findByText('کوتاهی VIP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش کوتاهی VIP' })).toBeInTheDocument();
    fireEvent.click(within(step).getByRole('button', { name: /^افزودن خدمت$/ }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'کوتاهی مو' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the service catalog scrollable and filters suggestions by search', async () => {
    const step = await reachServicesStep('hair_salon');
    fireEvent.click(within(step).getByRole('button', { name: /^افزودن خدمت$/ }));
    const catalog = await screen.findByRole('dialog');
    const search = within(catalog).getByRole('searchbox', {
      name: 'جست‌وجوی خدمت پیشنهادی',
    });
    const list = within(catalog).getByTestId('suggested-services-list');

    expect(list).toHaveClass('overflow-y-auto');
    expect(within(list).queryByRole('button', { name: 'کراتین مو' })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'کراتین' } });

    expect(within(list).getByRole('button', { name: 'کراتین مو' })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'کوتاهی مو' })).not.toBeInTheDocument();
  });
});
