import { useAppTheme } from '@/core/context/theme-context';

export function useColorScheme() {
  return useAppTheme().colorScheme;
}
