import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CheckoutScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Checkout' }} />
      <IconSymbol name="bag.fill" size={64} color={colors.icon} />
      <ThemedText type="title" style={styles.title}>
        Checkout
      </ThemedText>
      <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
        Razorpay integration coming soon.{'\n'}Cash and online payment options will appear here.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  title: { marginTop: 12 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
