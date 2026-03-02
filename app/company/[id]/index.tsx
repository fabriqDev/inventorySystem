import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useCompany } from '@/contexts/company-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TileId } from '@/types/tiles';

type IconName = Parameters<typeof IconSymbol>[0]['name'];

const TILE_CONFIG: Record<TileId, { label: string; icon: IconName; description: string }> = {
  inventory: {
    label: 'Inventory',
    icon: 'archivebox.fill',
    description: 'View products & stock levels',
  },
  sale_history: {
    label: 'Sales',
    icon: 'chart.bar.fill',
    description: 'View past orders & revenue',
  },
  new_sale: {
    label: 'Create Order',
    icon: 'cart.fill',
    description: 'Start a new order',
  },
};

const TILE_ROUTES: Record<TileId, string> = {
  inventory: 'inventory',
  sale_history: 'orders',
  new_sale: 'create-order',
};

export default function CompanyTilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { selectedCompany } = useCompany();

  const tiles = selectedCompany?.visible_tiles ?? [];

  const handleTilePress = useCallback(
    (tileId: TileId) => {
      const route = TILE_ROUTES[tileId];
      router.push(`/company/${id}/${route}` as any);
    },
    [id, router],
  );

  const renderTile = useCallback(
    ({ item }: { item: TileId }) => {
      const config = TILE_CONFIG[item];
      if (!config) return null;

      return (
        <Pressable
          onPress={() => handleTilePress(item)}
          style={({ pressed }) => [
            styles.tile,
            { backgroundColor: colors.background, borderColor: colors.icon + '25' },
            pressed && styles.tilePressed,
          ]}
        >
          <View style={[styles.tileIcon, { backgroundColor: colors.tint + '12' }]}>
            <IconSymbol name={config.icon} size={32} color={colors.tint} />
          </View>
          <View style={styles.tileBody}>
            <ThemedText type="defaultSemiBold" style={styles.tileLabel}>
              {config.label}
            </ThemedText>
            <ThemedText style={[styles.tileDesc, { color: colors.icon }]}>
              {config.description}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={colors.icon} />
        </Pressable>
      );
    },
    [colors, handleTilePress],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: selectedCompany?.name ?? 'Company' }} />
      <FlatList
        data={tiles}
        keyExtractor={(item) => item}
        renderItem={renderTile}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={{ color: colors.icon }}>No tiles available</ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 20 },
  separator: { height: 14 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
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
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
});
