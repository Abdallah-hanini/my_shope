import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from './locale';

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <LocaleProvider>{children}</LocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
