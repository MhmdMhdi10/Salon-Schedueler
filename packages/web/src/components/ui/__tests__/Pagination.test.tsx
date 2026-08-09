import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '../Pagination';

describe('Pagination', () => {
  it('does not render for a single page', () => {
    render(<Pagination page={1} pageSize={10} total={10} onPageChange={vi.fn()} />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('reports range and changes page through controls', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={25} onPageChange={onPageChange} />);

    expect(screen.getByText(/نمایش/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قبلی' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'صفحه 2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('uses compact page buttons for long lists', () => {
    render(<Pagination page={5} pageSize={10} total={200} onPageChange={vi.fn()} />);

    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'صفحه 5' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
