import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../Tabs';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the Tabs primitive (Radix-based, used by the calendar
 * day/week toggle). Verifies role=tab/tablist/tabpanel semantics, aria-selected
 * tracking, panel switching, and axe checks. Also asserts the tablist is
 * RTL-aware (renders under dir=rtl without breaking semantics).
 * Requirements: 2.2, 2.9, 10.4, 12.4
 */
function Example() {
  return (
    <Tabs defaultValue="day">
      <TabsList aria-label="نمای تقویم">
        <TabsTrigger value="day">روز</TabsTrigger>
        <TabsTrigger value="week">هفته</TabsTrigger>
      </TabsList>
      <TabsContent value="day">نمای روز</TabsContent>
      <TabsContent value="week">نمای هفته</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes role=tab semantics with the first tab selected', () => {
    render(<Example />);
    expect(screen.getByRole('tablist', { name: 'نمای تقویم' })).toBeInTheDocument();
    const dayTab = screen.getByRole('tab', { name: 'روز' });
    const weekTab = screen.getByRole('tab', { name: 'هفته' });
    expect(dayTab).toHaveAttribute('aria-selected', 'true');
    expect(weekTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('نمای روز');
  });

  it('switches the active tab and panel on selection', () => {
    render(<Example />);
    // Radix activates a tab on pointer-down / focus (not a bare click event),
    // matching real user interaction.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'هفته' }), {
      button: 0,
    });
    expect(screen.getByRole('tab', { name: 'هفته' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('نمای هفته');
  });

  it('has no serious/critical a11y violations under RTL', async () => {
    const { rtlContainer } = renderRtl(<Example />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
