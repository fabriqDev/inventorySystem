import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { sessionStorageBackend } from '@/core/backend/nhost';

import { SessionProvider, useAuth } from '@/core/context/auth-context';
import { AppThemeProvider } from '@/core/context/theme-context';
import { DataSourceProvider } from '@/core/context/data-source-context';
import { CompanyProvider } from '@/core/context/company-context';
import { ProductCacheProvider } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { ToastHost } from '@/core/components/toast-host';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current === 'active' && next.match(/inactive|background/)) {
        void sessionStorageBackend.flush();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ToastHost />
        <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="company" options={{ headerShown: false }} />
        </Stack.Protected>
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <SessionProvider>
        <DataSourceProvider>
          <ProductCacheProvider>
            <CompanyProvider>
              <RootLayoutNav />
            </CompanyProvider>
          </ProductCacheProvider>
        </DataSourceProvider>
      </SessionProvider>
    </AppThemeProvider>
  );
}
