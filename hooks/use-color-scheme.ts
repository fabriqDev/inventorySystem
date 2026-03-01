import { useAppTheme } from '@/contexts/theme-context';

export function useColorScheme() {
  return useAppTheme().colorScheme;
}
