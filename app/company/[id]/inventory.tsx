import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProductSearchList } from '@/components/product-search-list';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleTransferPress = () => {
    router.push(`/company/${id}/inventory-transfer` as any);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Inventory' }} />
      <Pressable
        onPress={handleTransferPress}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: colors.background, borderColor: colors.icon + '25' },
          pressed && styles.tilePressed,
        ]}
      >
        <View style={[styles.tileIcon, { backgroundColor: colors.tint + '12' }]}>
          <IconSymbol name="arrow.left.arrow.right" size={32} color={colors.tint} />
        </View>
        <View style={styles.tileBody}>
          <ThemedText type="defaultSemiBold" style={styles.tileLabel}>
            Inventory Transfer
          </ThemedText>
          <ThemedText style={[styles.tileDesc, { color: colors.icon }]}>
            Create transfer or accept incoming requests
          </ThemedText>
        </View>
        <IconSymbol name="chevron.right" size={20} color={colors.icon} />
      </Pressable>
      <View style={styles.listWrap}>
        <ProductSearchList companyId={id} showQuantity />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tilePressed: { opacity: 0.7 },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: { flex: 1, marginLeft: 16, gap: 2 },
  tileLabel: { fontSize: 17 },
  tileDesc: { fontSize: 13, lineHeight: 18 },
  listWrap: { flex: 1 },
});
