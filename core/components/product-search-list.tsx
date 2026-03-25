import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchProducts, PRODUCTS_PAGE_SIZE } from '@/core/api/products';
import { ProductListItemCell } from '@/core/components/product-list-item-cell';
import { ThemedText } from '@/core/components/themed-text';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { Strings } from '@/core/strings';
import { UNIFORM_GROUP_TAB_ORDER, UniformGroup, type Product, type UniformGroupValue } from '@/core/types/product';

type UniformGroupFilter = 'all' | UniformGroupValue;

function uniformGroupFilterLabel(g: UniformGroupValue): string {
  switch (g) {
    case UniformGroup.TOP:
      return Strings.company.uniformGroupTop;
    case UniformGroup.BOTTOM:
      return Strings.company.uniformGroupBottom;
    case UniformGroup.ACCESSORY:
      return Strings.company.uniformGroupAccessory;
    case UniformGroup.OVERALLS:
      return Strings.company.uniformGroupOveralls;
    case UniformGroup.GENERIC:
      return Strings.company.uniformGroupGeneric;
  }
}

const UNIFORM_GROUP_FILTER_TABS: { value: UniformGroupFilter; label: string }[] = [
  { value: 'all', label: Strings.company.all },
  ...UNIFORM_GROUP_TAB_ORDER.map((g) => ({ value: g, label: uniformGroupFilterLabel(g) })),
];

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
  /** When provided, used instead of the default row (e.g. inventory passes the same cell with `lowStockThreshold`). */
  renderItem?: (item: Product) => React.ReactNode;
}

/** Screens wider than this (in dp/pt) get a 2-column grid; phones stay single-column. */
const TWO_COLUMN_BREAKPOINT = 600;

export function ProductSearchList({ companyId, onSelectProduct, showQuantity, renderItem: customRenderItem }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const numColumns = screenWidth >= TWO_COLUMN_BREAKPOINT ? 2 : 1;
  const { useMockData } = useDataSource();
  const {
    getCachedProducts,
    filterProducts,
    isLoading: cacheLoading,
    isCached,
  } = useProductCache();

  const [search, setSearch] = useState('');
  const [uniformGroupFilter, setUniformGroupFilter] = useState<UniformGroupFilter>('all');
  const [backendResults, setBackendResults] = useState<Product[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendLoadingMore, setBackendLoadingMore] = useState(false);
  const [backendPage, setBackendPage] = useState(1);
  const [backendHasMore, setBackendHasMore] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setUniformGroupFilter('all');
  }, [companyId]);

  const localFiltered = useMemo(
    () => filterProducts(companyId, search),
    [companyId, filterProducts, search],
  );

  const rawDisplayProducts = backendResults !== null ? backendResults : localFiltered;
  const groupFilteredProducts = useMemo(() => {
    if (uniformGroupFilter === 'all') return rawDisplayProducts;
    return rawDisplayProducts.filter((p) => p.uniform_group === uniformGroupFilter);
  }, [rawDisplayProducts, uniformGroupFilter]);

  const displayProducts = useMemo(() => {
    if (groupFilteredProducts.length <= 1) return groupFilteredProducts;
    return [...groupFilteredProducts].sort(compareProductsByNameThenSize);
  }, [groupFilteredProducts]);
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
      <ProductListItemCell
        product={item}
        showQuantity={showQuantity}
        onPress={onSelectProduct}
      />
    ),
    [onSelectProduct, showQuantity],
  );

  const renderItem = useCallback(
    ({ item }: { item: Product }): React.ReactElement | null => {
      const content = customRenderItem
        ? ((customRenderItem(item) as React.ReactElement) ?? defaultRenderItem({ item }))
        : defaultRenderItem({ item });
      // In 2-column mode wrap in flex:1 so each item fills its column
      if (numColumns > 1) {
        return <View style={styles.columnItem}>{content}</View>;
      }
      return content;
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersScroll}
      >
        {UNIFORM_GROUP_FILTER_TABS.map((tab, chipIndex) => {
          const active = uniformGroupFilter === tab.value;
          return (
            <Pressable
              key={tab.value}
              onPress={() => setUniformGroupFilter(tab.value)}
              style={({ pressed }) => [
                styles.chip,
                chipIndex < UNIFORM_GROUP_FILTER_TABS.length - 1 && styles.chipSpacing,
                active
                  ? { backgroundColor: colors.tint }
                  : { backgroundColor: colors.icon + '12', borderWidth: 1, borderColor: colors.icon + '22' },
                pressed && { opacity: 0.85 },
              ]}
            >
              <ThemedText
                numberOfLines={1}
                includeFontPadding={false}
                style={[styles.chipText, active ? { color: '#fff' } : { color: colors.text }]}
              >
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

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
            key={`list-${numColumns}`}
            data={displayProducts}
            keyExtractor={(item) => item.article_code}
            renderItem={renderItem}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
            contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
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
  filtersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
  },
  filtersContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingRight: 20,
  },
  chip: {
    flexShrink: 0,
    flexGrow: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSpacing: { marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  separator: { height: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noLocal: { marginBottom: 12 },
  searchBackendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 10,
  },
  footer: { paddingVertical: 16 },
  /** Spacing between the two columns in grid mode */
  columnWrapper: { gap: 10 },
  /** Each item fills its column in 2-column grid mode */
  columnItem: { flex: 1 },
});
