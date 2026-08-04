import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RouteProgress } from '../RouteProgress';

describe('RouteProgress', () => {
  it('appears for pathname navigation but not on the first render', async () => {
    render(
      <MemoryRouter initialEntries={['/one']}>
        <RouteProgress />
        <Link to="/two">صفحه بعد</Link>
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('route-progress')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'صفحه بعد' }));
    await waitFor(() => expect(screen.getByTestId('route-progress')).toBeInTheDocument());
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('در حال باز کردن صفحه');
  });
});
