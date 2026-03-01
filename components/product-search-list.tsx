import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useDataSource } from '@/contexts/data-source-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fetchProducts, PRODUCTS_PAGE_SIZE } from '@/lib/api/products';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types/product';

interface Props {
  companyId: string;
  onSelectProduct?: (product: Product) => void;
  showQuantity?: boolean;
}

export function ProductSearchList({ companyId, onSelectProduct, showQuantity }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { useMockData } = useDataSource();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setPage(1);
    setLoading(true);
    fetchProducts(companyId, { search: debouncedSearch, page: 1 }, useMockData)
      .then((res) => {
        if (!mountedRef.current) return;
        setProducts(res.products);
        setHasMore(res.has_more);
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [companyId, debouncedSearch, useMockData]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetchProducts(companyId, { search: debouncedSearch, page: nextPage }, useMockData)
      .then((res) => {
        if (!mountedRef.current) return;
        setProducts((prev) => [...prev, ...res.products]);
        setHasMore(res.has_more);
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoadingMore(false); });
  }, [companyId, debouncedSearch, hasMore, loadingMore, page, useMockData]);

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <Pressable
        onPress={() => onSelectProduct?.(item)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.background, borderColor: colors.icon + '30' },
          pressed && onSelectProduct && styles.cardPressed,
        ]}
      >
        <View style={styles.cardBody}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {item.name}
          </ThemedText>
          <ThemedText style={[styles.sku, { color: colors.icon }]}>
            SKU: {item.sku}
          </ThemedText>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.priceBadge, { backgroundColor: colors.tint + '15' }]}>
            <ThemedText style={[styles.priceText, { color: colors.tint }]}>
              {formatPrice(item.price, item.currency)}
            </ThemedText>
          </View>
          {showQuantity && item.quantity != null && (
            <ThemedText style={[styles.qty, { color: colors.icon }]}>
              Qty: {item.quantity}
            </ThemedText>
          )}
        </View>
      </Pressable>
    ),
    [colors, onSelectProduct, showQuantity],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.searchWrap, { borderColor: colors.icon + '40' }]}>
        <IconSymbol name="magnifyingglass" size={20} color={colors.icon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name, SKU, or barcode…"
          placeholderTextColor={colors.icon}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <IconSymbol name="xmark" size={18} color={colors.icon} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>No products found</ThemedText>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footer} color={colors.tint} />
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  separator: { height: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardPressed: { opacity: 0.7 },
  cardBody: { flex: 1, gap: 2 },
  sku: { fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priceText: { fontSize: 13, fontWeight: '600' },
  qty: { fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: { paddingVertical: 16 },
});
