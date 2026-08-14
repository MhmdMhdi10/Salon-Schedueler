import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeScope, useThemeScope } from '../ThemeProvider';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '../../ui/Dialog';
import { Button } from '../../ui/Button';

/**
 * Scoped-theme portal safety (design-system finding: "Scoped owner theme
 * breaks for portaled overlays"). A subtree wrapped in `ThemeScope` provides
 * its theme via context, and every shared portaled primitive stamps that theme
 * as `data-theme` on its portal root — so a dialog opened from the dark owner
 * panel renders dark even though it portals to `document.body`.
 */

afterEach(cleanup);

function ScopeProbe() {
  const scope = useThemeScope();
  return <span data-testid="probe">{scope ?? 'none'}</span>;
}

describe('ThemeScope', () => {
  it('stamps data-theme on the wrapper and provides it via useThemeScope', () => {
    render(
      <ThemeScope theme="dark" data-testid="scope">
        <ScopeProbe />
      </ThemeScope>,
    );
    expect(screen.getByTestId('scope')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('useThemeScope is undefined outside any scope (portals inherit <html>)', () => {
    render(<ScopeProbe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('a Dialog opened inside a scope carries the scope theme into its portal', async () => {
    render(
      <ThemeScope theme="dark">
        <Dialog>
          <DialogTrigger asChild>
            <Button>باز کردن</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>گفت‌وگو</DialogTitle>
          </DialogContent>
        </Dialog>
      </ThemeScope>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن' }));
    const dialog = await screen.findByRole('dialog');
    // The portal root (the dialog content) re-stamps the scope theme even
    // though it renders under document.body, outside the ThemeScope wrapper.
    expect(dialog).toHaveAttribute('data-theme', 'dark');
  });
});
