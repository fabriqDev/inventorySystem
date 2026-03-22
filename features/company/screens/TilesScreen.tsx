import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useCompany } from '@/core/context/company-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { Strings } from '@/core/strings';
import type { TileId } from '@/core/types/tiles';
import { TileIds } from '@/core/types/tiles';

type IconName = Parameters<typeof IconSymbol>[0]['name'];

const TILE_CONFIG: Record<TileId, { label: string; icon: IconName; description: string }> = {
  inventory: {
    label: Strings.company.inventory,
    icon: 'archivebox.fill',
    description: Strings.company.inventoryDescription,
  },
  sale_history: {
    label: Strings.company.sales,
    icon: 'chart.bar.fill',
    description: Strings.company.salesDescription,
  },
  new_sale: {
    label: Strings.company.createOrder,
    icon: 'cart.fill',
    description: Strings.company.createOrderDescription,
  },
  inventory_transfer: {
    label: Strings.company.transfer,
    icon: 'shippingbox.fill',
    description: Strings.company.transferDescription,
  },
  add_products: {
    label: Strings.company.addProducts,
    icon: 'plus.circle.fill',
    description: Strings.company.addProductsDescription,
  },
  requested_items_tile: {
    label: Strings.company.requestedItems,
    icon: 'list.bullet.clipboard.fill',
    description: Strings.company.requestedItemsDescription,
  },
};

const TILE_ROUTES: Record<TileId, string> = {
  [TileIds.INVENTORY]: 'inventory',
  [TileIds.SALE_HISTORY]: 'orders',
  [TileIds.NEW_SALE]: 'create-order',
  [TileIds.INVENTORY_TRANSFER]: 'inventory-transfer',
  [TileIds.ADD_PRODUCTS]: 'add-products',
  [TileIds.REQUESTED_ITEMS]: 'requested-items',
};

/** Client-side order so “Create Order” stays above “Requested Items” regardless of API array order. */
const TILE_DISPLAY_ORDER: TileId[] = [
  TileIds.NEW_SALE,
  TileIds.REQUESTED_ITEMS,
  TileIds.SALE_HISTORY,
  TileIds.INVENTORY,
  TileIds.INVENTORY_TRANSFER,
  TileIds.ADD_PRODUCTS,
];

const HEADER_GAP = 24;

function HeaderBackButton() {
  const router = useRouter();
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <Pressable
      onPress={() => router.back()}
      style={({ pressed }) => [pressed && { opacity: 0.7 }, styles.headerSide]}
    >
      <IconSymbol name="chevron.left" size={24} color={colors.text} />
    </Pressable>
  );
}

function HeaderTitleScroll({ title }: { title: string }) {
  return (
    <View style={styles.headerTitleWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.headerTitleScroll}
      >
        <ThemedText type="subtitle" numberOfLines={1} style={styles.headerTitleText}>
          {title}
        </ThemedText>
      </ScrollView>
    </View>
  );
}

function HeaderRefreshButton({ companyId }: { companyId: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { refreshProducts, isLoading } = useProductCache();
  const loading = isLoading(companyId);

  return (
    <Pressable
      onPress={() => companyId && refreshProducts(companyId)}
      disabled={loading}
      style={({ pressed }) => [pressed && !loading && { opacity: 0.7 }, styles.headerSide]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.tint} style={styles.headerSpinner} />
      ) : (
        <IconSymbol name="arrow.clockwise" size={22} color={colors.text} />
      )}
    </Pressable>
  );
}

export default function TilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { selectedCompany } = useCompany();
  const { refreshProducts } = useProductCache();
  const hasNavigatedToChildRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      if (hasNavigatedToChildRef.current) {
        hasNavigatedToChildRef.current = false;
        return;
      }
      refreshProducts(id);
    }, [id, refreshProducts]),
  );

  const listData = useMemo(() => {
    const raw = selectedCompany?.visible_tiles ?? [];
    const set = new Set(raw);
    const ordered = TILE_DISPLAY_ORDER.filter((t) => set.has(t));
    const rest = raw.filter((t) => !TILE_DISPLAY_ORDER.includes(t as TileId));
    return [...ordered, ...rest];
  }, [selectedCompany?.visible_tiles]);

  const handleTilePress = useCallback(
    (tileId: TileId) => {
      hasNavigatedToChildRef.current = true;
      const route = TILE_ROUTES[tileId];
      router.push(`/company/${id}/${route}` as any);
    },
    [id, router],
  );

  const renderTile = useCallback(
    ({ item }: { item: string }) => {
      const config = TILE_CONFIG[item as TileId];
      if (!config) return null;

      return (
        <Pressable
          onPress={() => handleTilePress(item as TileId)}
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
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderBackButton />,
          headerTitle: () => (
            <HeaderTitleScroll title={selectedCompany?.name ?? 'Company'} />
          ),
          headerRight: () => (id ? <HeaderRefreshButton companyId={id} /> : null),
          headerTitleAlign: 'center',
        }}
      />
      <FlatList
        data={listData}
        keyExtractor={(item) => item}
        renderItem={renderTile}
        contentContainerStyle={[styles.list, { paddingBottom: 20 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={{ color: colors.icon }}>{Strings.company.noTilesAvailable}</ThemedText>
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
  headerSide: { padding: 4, marginHorizontal: 4 },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: HEADER_GAP,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  headerTitleScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitleText: { fontSize: 17 },
  headerSpinner: { marginRight: 4 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
});
