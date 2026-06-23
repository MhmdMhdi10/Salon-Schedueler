import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { QrLandingPage } from './pages/QrLandingPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { BookingConfirmPage } from './pages/BookingConfirmPage';
import { BookingSuccessPage } from './pages/BookingSuccessPage';
import { ConfigurationPage } from './pages/admin/ConfigurationPage';
import { CalendarPage } from './pages/admin/CalendarPage';
import { AnalyticsPage } from './pages/admin/AnalyticsPage';

/**
 * Root component for the Salon Booking PWA.
 * Configures routing for customer and admin flows.
 */
export function App() {
  return (
    <BrowserRouter>
      <div dir="rtl" lang="fa" className="app-root">
        <Routes>
          {/* Customer flows */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/qr/:payload" element={<QrLandingPage />} />
          <Route path="/salon/:salonId/book" element={<AvailabilityPage />} />
          <Route path="/salon/:salonId/book/confirm" element={<BookingConfirmPage />} />
          <Route path="/booking/success" element={<BookingSuccessPage />} />

          {/* Admin flows */}
          <Route path="/admin/config" element={<ConfigurationPage />} />
          <Route path="/admin/calendar" element={<CalendarPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />

          {/* Default */}
          <Route path="/" element={<AuthPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
