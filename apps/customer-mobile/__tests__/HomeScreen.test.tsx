import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '../src/config';
import { HomeScreen } from '../src/HomeScreen';
import { LocaleProvider } from '../src/locale';

jest.mock('../src/config', () => ({
  APP_ROLE: 'customer',
  api: { ready: jest.fn(), live: jest.fn() },
}));

const ready = api.ready as jest.Mock;

function renderScreen(initial: 'en' | 'ar' = 'en') {
  const client = new QueryClient({
    // gcTime Infinity: no garbage-collection timers left running after the test, so Jest exits cleanly.
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <LocaleProvider initial={initial}>
          <HomeScreen />
        </LocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('customer HomeScreen', () => {
  beforeEach(() => ready.mockReset());

  it('shows each dependency status from the API', async () => {
    ready.mockResolvedValue({
      status: 'down',
      checkedAt: '2026-01-01T00:00:00.000Z',
      version: '0',
      checks: [
        { name: 'database', status: 'up', latencyMs: 1 },
        { name: 'cache', status: 'down', latencyMs: 1 },
        { name: 'queue', status: 'up', latencyMs: 1 },
      ],
    });
    renderScreen();
    expect(screen.getByText('Customer App')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Cache: Unavailable')).toBeTruthy());
    expect(screen.getByLabelText('Database: Operational')).toBeTruthy();
  });

  it('shows an explicit error and retries when the API is unreachable', async () => {
    ready.mockRejectedValue(new Error('Network request failed'));
    renderScreen();
    await waitFor(() => expect(screen.getByText('The API could not be reached.')).toBeTruthy());
    ready.mockResolvedValue({
      status: 'up',
      checkedAt: '2026-01-01T00:00:00.000Z',
      version: '0',
      checks: [],
    });
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('API: Operational')).toBeTruthy();
  });

  it('switches to Arabic', async () => {
    ready.mockResolvedValue({
      status: 'up',
      checkedAt: '2026-01-01T00:00:00.000Z',
      version: '0',
      checks: [],
    });
    renderScreen('en');
    await screen.findByLabelText('API: Operational');
    fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    expect(screen.getByText('تطبيق العملاء')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
    expect(screen.getByLabelText('واجهة البرمجة: يعمل')).toBeTruthy();
  });
});
