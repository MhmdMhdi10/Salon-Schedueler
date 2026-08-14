import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerSetupAlert } from '../OwnerSetupAlert';

const getStaff = vi.fn();
const getChairs = vi.fn();
const createChair = vi.fn();
const getServices = vi.fn();
const getSalonHours = vi.fn();

vi.mock('../../../api/client', () => ({
  adminApi: {
    getStaff: (...args: unknown[]) => getStaff(...args),
    getChairs: (...args: unknown[]) => getChairs(...args),
    createChair: (...args: unknown[]) => createChair(...args),
  },
  salonApi: { getServices: (...args: unknown[]) => getServices(...args) },
  workingHoursApi: { getSalon: (...args: unknown[]) => getSalonHours(...args) },
}));

function renderAlert() {
  return render(
    <MemoryRouter>
      <OwnerSetupAlert salonId="salon-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getStaff.mockResolvedValue({
    staff: [{ id: 'staff-1', fullName: 'سارا', role: 'Owner', active: true }],
  });
  getServices.mockResolvedValue({ services: [{ id: 'service-1', name: 'کوتاهی' }] });
  getSalonHours.mockResolvedValue({ hours: [{ weekday: 3, startTime: '09:00', endTime: '20:00' }] });
});

describe('OwnerSetupAlert', () => {
  it('stays visible for a blocking issue and fixes a missing chair in one click', async () => {
    getChairs
      .mockResolvedValueOnce({ chairs: [] })
      .mockResolvedValue({ chairs: [{ id: 'chair-1', name: 'صندلی ۱', active: true }] });
    createChair.mockResolvedValue({ chair: { id: 'chair-1', name: 'صندلی ۱', active: true } });

    renderAlert();

    expect(await screen.findByText('هیچ صندلی فعالی تعریف نشده')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت صندلی پیش‌فرض' }));

    await waitFor(() => expect(createChair).toHaveBeenCalledWith('salon-1', { name: 'صندلی ۱' }));
    await waitFor(() => expect(screen.queryByTestId('owner-setup-alert')).not.toBeInTheDocument());
  });

  it('renders nothing when booking prerequisites are healthy', async () => {
    getChairs.mockResolvedValue({ chairs: [{ id: 'chair-1', active: true }] });
    const { container } = renderAlert();

    await waitFor(() => expect(getSalonHours).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
