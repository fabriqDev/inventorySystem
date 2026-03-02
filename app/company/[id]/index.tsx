import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useCompany } from '@/contexts/company-context';
import { useProductCache } from '@/contexts/product-cache-context';
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

export default function CompanyTilesScreen() {
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

  const tiles = selectedCompany?.visible_tiles ?? [];
  const listData: string[] = tiles;

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
