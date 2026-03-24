import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/core/components/themed-text';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { fetchProducts, PRODUCTS_PAGE_SIZE } from '@/core/api/products';
import { formatPrice } from '@/core/services/format';
import { getAvailableStock } from '@/core/types/product';
import type { Product } from '@/core/types/product';

/** Same product name grouped together; within a name, sort by size; stable tie-breaker. */
function compareProductsByNameThenSize(a: Product, b: Product): number {
  const nameCmp = (a.name ?? '').localeCompare(b.name ?? '', undefined, {
    sensitivity: 'base',
  });
  if (nameCmp !== 0) return nameCmp;
  const sizeA = (a.size ?? '').trim();
  const sizeB = (b.size ?? '').trim();
  const sizeCmp = sizeA.localeCompare(sizeB, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (sizeCmp !== 0) return sizeCmp;
  return (a.article_code ?? '').localeCompare(b.article_code ?? '');
}

interface Props {
  companyId: string;
  onSelectProduct?: (product: Product) => void;
  showQuantity?: boolean;
  /** When provided, used instead of the default row (e.g. for inventory screen with custom cell). */
  renderItem?: (item: Product) => React.ReactNode;
}

export function ProductSearchList({ companyId, onSelectProduct, showQuantity, renderItem: customRenderItem }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = width >= 768 ? 2 : 1;
  const { useMockData } = useDataSource();
  const {
    getCachedProducts,
    filterProducts,
    isLoading: cacheLoading,
    isCached,
  } = useProductCache();

  const [search, setSearch] = useState('');
  const [backendResults, setBackendResults] = useState<Product[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendLoadingMore, setBackendLoadingMore] = useState(false);
  const [backendPage, setBackendPage] = useState(1);
  const [backendHasMore, setBackendHasMore] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const localFiltered = useMemo(
    () => filterProducts(companyId, search),
    [companyId, filterProducts, search],
  );

  const rawDisplayProducts = backendResults !== null ? backendResults : localFiltered;
  const displayProducts = useMemo(() => {
    if (rawDisplayProducts.length <= 1) return rawDisplayProducts;
    return [...rawDisplayProducts].sort(compareProductsByNameThenSize);
  }, [rawDisplayProducts]);
  const showingBackend = backendResults !== null;
  const showSearchBackendButton =
    search.trim().length > 0 && localFiltered.length === 0 && !showingBackend;

  useEffect(() => {
    setBackendResults(null);
  }, [search]);

  const runBackendSearch = useCallback(
    (pageNum: number, append: boolean) => {
      if (pageNum === 1) setBackendLoading(true);
      else setBackendLoadingMore(true);
      fetchProducts(
        companyId,
        { search: search.trim(), page: pageNum, limit: PRODUCTS_PAGE_SIZE },
        useMockData,
      )
        .then((res) => {
          if (!mountedRef.current) return;
          if (append) {
            setBackendResults((prev) => [...(prev ?? []), ...res.products]);
          } else {
            setBackendResults(res.products);
          }
          setBackendHasMore(res.has_more);
          setBackendPage(pageNum);
        })
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current) {
            setBackendLoading(false);
            setBackendLoadingMore(false);
          }
        });
    },
    [companyId, search, useMockData],
  );

  const handleSearchBackend = useCallback(() => {
    setBackendResults(null);
    runBackendSearch(1, false);
  }, [runBackendSearch]);

  const loadMore = useCallback(() => {
    if (!showingBackend || !backendHasMore || backendLoadingMore) return;
    runBackendSearch(backendPage + 1, true);
  }, [showingBackend, backendHasMore, backendLoadingMore, backendPage, runBackendSearch]);

  const defaultRenderItem = useCallback(
    ({ item }: { item: Product }) => (
      <Pressable
        onPress={() => onSelectProduct?.(item)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.background, borderColor: colors.icon + '30' },
          numColumns > 1 && styles.cardMultiCol,
          pressed && onSelectProduct && styles.cardPressed,
        ]}
      >
        <View style={styles.cardBody}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.productName}>
            {item.name}
          </ThemedText>
          {item.size?.trim() ? (
            <ThemedText style={[styles.sizeLabel, { color: colors.icon }]}>
              Size: <ThemedText style={styles.sizeValue}>{item.size.trim()}</ThemedText>
            </ThemedText>
          ) : null}
          <ThemedText style={[styles.codeText, { color: colors.icon }]}>
            Code: {item.scan_code}
          </ThemedText>
        </View>
        <View style={styles.cardRight}>
          {!showQuantity && (
            <View style={[styles.priceBadge, { backgroundColor: colors.tint + '15' }]}>
              <ThemedText style={[styles.priceText, { color: colors.tint }]}>
                {formatPrice(item.price, item.currency)}
              </ThemedText>
            </View>
          )}
          {showQuantity && item.quantity != null && (
            <ThemedText style={[styles.qty, { color: colors.icon }]}>
              Qty: {getAvailableStock(item)}
            </ThemedText>
          )}
        </View>
      </Pressable>
    ),
    [colors, onSelectProduct, showQuantity, numColumns],
  );

  const renderItem = useCallback(
    ({ item }: { item: Product }): React.ReactElement | null => {
      // Invisible spacer to keep the last odd cell from stretching full width
      if ((item as any).__spacer) return <View style={styles.cardMultiCol} />;
      if (customRenderItem) {
        const node = customRenderItem(item) as React.ReactElement;
        if (!node) return defaultRenderItem({ item });
        // Wrap in flex container so custom cells fill column width equally
        return numColumns > 1 ? <View style={styles.cardMultiCol}>{node}</View> : node;
      }
      return defaultRenderItem({ item });
    },
    [customRenderItem, defaultRenderItem, numColumns],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.searchWrap, { borderColor: colors.icon + '40' }]}>
        <IconSymbol name="magnifyingglass" size={20} color={colors.icon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search product"
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

      {cacheLoading(companyId) && !isCached(companyId) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : backendLoading && displayProducts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : displayProducts.length === 0 && !showSearchBackendButton ? (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>No products found</ThemedText>
        </View>
      ) : showSearchBackendButton && displayProducts.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={[styles.noLocal, { color: colors.icon }]}>
            No matching products in cache
          </ThemedText>
          <Pressable
            onPress={handleSearchBackend}
            style={[styles.searchBackendBtn, { borderColor: colors.tint }]}
          >
            <ThemedText style={{ color: colors.tint }}>Search backend</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            key={numColumns}
            data={numColumns > 1 && displayProducts.length % 2 !== 0
              ? [...displayProducts, { __spacer: true } as any]
              : displayProducts}
            keyExtractor={(item, index) => (item as any).__spacer ? `__spacer_${index}` : item.article_code}
            numColumns={numColumns}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
            columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReached={showingBackend ? loadMore : undefined}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              backendLoadingMore ? (
                <ActivityIndicator style={styles.footer} color={colors.tint} />
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        </>
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
  cardMultiCol: { flex: 1 },
  cardPressed: { opacity: 0.7 },
  cardBody: { flex: 1, gap: 2 },
  productName: { fontSize: 15 },
  sizeLabel: { fontSize: 12 },
  sizeValue: { fontWeight: '600', fontSize: 12 },
  codeText: { fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priceText: { fontSize: 13, fontWeight: '600' },
  qty: { fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noLocal: { marginBottom: 12 },
  searchBackendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 10,
  },
  columnWrapper: { gap: 10 },
  footer: { paddingVertical: 16 },
});
