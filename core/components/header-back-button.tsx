import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { Strings } from '@/core/strings';

/** Explicit stack back control — required on web where default header back is often hidden. */
export function HeaderBackButton() {
  const router = useRouter();
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={Strings.common.goBack}
      onPress={() => router.back()}
      style={({ pressed }) => [pressed && { opacity: 0.7 }, styles.hitArea]}
    >
      <IconSymbol name="chevron.left" size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: { padding: 4, marginHorizontal: 4 },
});
