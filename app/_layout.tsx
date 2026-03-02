import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { SessionProvider, useAuth } from '@/contexts/auth-context';
import { AppThemeProvider } from '@/contexts/theme-context';
import { DataSourceProvider } from '@/contexts/data-source-context';
import { CompanyProvider } from '@/contexts/company-context';
import { ProductCacheProvider } from '@/contexts/product-cache-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
