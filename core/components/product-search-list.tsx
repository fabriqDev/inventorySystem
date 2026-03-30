import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
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

import { fetchProducts, PRODUCTS_PAGE_SIZE } from '@/core/api/products';
import { InventoryStockFilterModal } from '@/core/components/inventory-stock-filter-modal';
import { ProductListItemCell } from '@/core/components/product-list-item-cell';
import { ThemedText } from '@/core/components/themed-text';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { Strings } from '@/core/strings';
import { ProductQuickFilterChips } from '@/core/components/product-quick-filter-chips';
import {
  productMatchesInventoryStockFilter,
  UNIFORM_GROUP_TAB_ORDER,
  UniformGroup,
  type InventoryStockFilter,
  type Product,
  type UniformGroupValue,
} from '@/core/types/product';
import {
  applyProductQuickFilter,
  QUICK_FILTER_HIGH_STOCK,
  QUICK_FILTER_LOW_STOCK,
  QUICK_FILTER_UNAVAILABLE,
  type ProductQuickFilter,
} from '@/core/types/product-quick-filter';

export type { ProductQuickFilter };
export { applyProductQuickFilter };

export type ProductSearchListHandle = {
  /** Company cache only: current search + quick filter. Ignores “Search backend” pagination results. */
  getProductsForExport: () => Product[];
  /** `variant="inventory"` only: opens the quantity / stock filter popup. */
  openInventoryStockFilter: () => void;
};

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

const PRODUCT_QUICK_FILTER_TABS: { value: ProductQuickFilter; label: string }[] = [
  { value: 'all', label: Strings.company.all },
  ...UNIFORM_GROUP_TAB_ORDER.map((g) => ({ value: g, label: uniformGroupFilterLabel(g) })),
  { value: QUICK_FILTER_LOW_STOCK, label: Strings.company.productSearchLowStock },
  { value: QUICK_FILTER_HIGH_STOCK, label: Strings.company.productSearchHighStock },
  { value: QUICK_FILTER_UNAVAILABLE, label: Strings.company.productSearchNotAvailable },
];

/** Inventory: category chips only; stock rules use {@link InventoryStockFilterModal}. */
export const INVENTORY_UNIFORM_TABS: { value: ProductQuickFilter; label: string }[] = [
  { value: 'all', label: Strings.company.all },
  ...UNIFORM_GROUP_TAB_ORDER.map((g) => ({ value: g, label: uniformGroupFilterLabel(g) })),
];

function applyUniformOnlyFilter(products: Product[], quickFilter: ProductQuickFilter): Product[] {
  if (quickFilter === 'all') return products;
  if (
    quickFilter === QUICK_FILTER_LOW_STOCK ||
    quickFilter === QUICK_FILTER_HIGH_STOCK ||
    quickFilter === QUICK_FILTER_UNAVAILABLE
  ) {
    return products;
  }
  return products.filter((p) => p.uniform_group === quickFilter);
}

function describeInventoryStockFilter(f: InventoryStockFilter | null): string {
  if (f == null) return Strings.company.inventoryStockFilterAll;
  if (f.kind === 'unavailable') return Strings.company.inventoryStockFilterUnavailable;
  if (f.kind === 'gt') return `${Strings.company.inventoryStockFilterGreaterThan} ${f.a}`;
  if (f.kind === 'lt') return `${Strings.company.inventoryStockFilterLessThan} ${f.a}`;
  const lo = Math.min(f.a, f.b);
  const hi = Math.max(f.a, f.b);
  return `${Strings.company.inventoryStockFilterBetween} ${lo} ${Strings.company.inventoryStockFilterAnd} ${hi}`;
}

export type ProductSearchListVariant = 'default' | 'inventory';

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
  /**
   * `inventory`: hide low/high/unavailable chips; stock filtering is a popup that composes with category + search.
   */
  variant?: ProductSearchListVariant;
  /**
   * Inventory only: hide the quantity-filter row under search (e.g. trigger from header via
   * {@link ProductSearchListHandle.openInventoryStockFilter}).
   */
  hideInventoryQuantityFilterRow?: boolean;
  /** Inventory only: called when the quantity/stock filter is applied or cleared. */
  onInventoryStockFilterChange?: (filter: InventoryStockFilter | null) => void;
}

/** Screens wider than this (in dp/pt) get a 2-column grid; phones stay single-column. */
const TWO_COLUMN_BREAKPOINT = 600;

export const ProductSearchList = forwardRef<ProductSearchListHandle, Props>(function ProductSearchList(
  {
    companyId,
    onSelectProduct,
    showQuantity,
    renderItem: customRenderItem,
    variant = 'default',
    hideInventoryQuantityFilterRow = false,
    onInventoryStockFilterChange,
  },
  ref,
) {
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
  /** Mutually exclusive: all, one uniform group, and (default variant only) stock quick filters. */
  const [quickFilter, setQuickFilter] = useState<ProductQuickFilter>('all');
  const [inventoryStockFilter, setInventoryStockFilter] = useState<InventoryStockFilter | null>(null);
  const [stockFilterModalVisible, setStockFilterModalVisible] = useState(false);
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
    setQuickFilter('all');
    setInventoryStockFilter(null);
  }, [companyId]);

  useEffect(() => {
    if (variant !== 'inventory') return;
    onInventoryStockFilterChange?.(inventoryStockFilter);
  }, [variant, inventoryStockFilter, onInventoryStockFilterChange]);

  const localFiltered = useMemo(
    () => filterProducts(companyId, search),
    [companyId, filterProducts, search],
  );

  useImperativeHandle(
    ref,
    () => ({
      getProductsForExport: () => {
        if (variant === 'inventory') {
          const u = applyUniformOnlyFilter(localFiltered, quickFilter);
          return u.filter((p) => productMatchesInventoryStockFilter(p, inventoryStockFilter));
        }
        return applyProductQuickFilter(localFiltered, quickFilter);
      },
      openInventoryStockFilter: () => {
        if (variant === 'inventory') setStockFilterModalVisible(true);
      },
    }),
    [localFiltered, quickFilter, variant, inventoryStockFilter],
  );

  const rawDisplayProducts = backendResults !== null ? backendResults : localFiltered;
  const filteredProducts = useMemo(() => {
    if (variant === 'inventory') {
      const uniformFiltered = applyUniformOnlyFilter(rawDisplayProducts, quickFilter);
      return uniformFiltered.filter((p) => productMatchesInventoryStockFilter(p, inventoryStockFilter));
    }
    return applyProductQuickFilter(rawDisplayProducts, quickFilter);
  }, [rawDisplayProducts, quickFilter, variant, inventoryStockFilter]);

  const displayProducts = useMemo(() => {
    if (filteredProducts.length <= 1) return filteredProducts;
    return [...filteredProducts].sort(compareProductsByNameThenSize);
  }, [filteredProducts]);
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

      {variant === 'inventory' && !hideInventoryQuantityFilterRow ? (
        <Pressable
          onPress={() => setStockFilterModalVisible(true)}
          style={({ pressed }) => [
            styles.stockFilterRow,
            { borderColor: colors.icon + '40', backgroundColor: colors.icon + '0c' },
            pressed && { opacity: 0.88 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={Strings.company.inventoryStockFilterButton}
        >
          <IconSymbol name="line.3.horizontal.decrease.circle" size={22} color={colors.tint} />
          <View style={styles.stockFilterRowText}>
            <ThemedText style={[styles.stockFilterTitle, { color: colors.text }]}>
              {Strings.company.inventoryStockFilterButton}
            </ThemedText>
            <ThemedText style={[styles.stockFilterSubtitle, { color: colors.icon }]} numberOfLines={1}>
              {describeInventoryStockFilter(inventoryStockFilter)}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={colors.icon} />
        </Pressable>
      ) : null}

      <View style={styles.quickFiltersWrap}>
        <ProductQuickFilterChips
          tabs={variant === 'inventory' ? INVENTORY_UNIFORM_TABS : PRODUCT_QUICK_FILTER_TABS}
          value={quickFilter}
          onChange={setQuickFilter}
          variant={variant}
        />
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
            key={`list-${numColumns}`}
            style={styles.listFlex}
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

      {variant === 'inventory' ? (
        <InventoryStockFilterModal
          visible={stockFilterModalVisible}
          onClose={() => setStockFilterModalVisible(false)}
          appliedFilter={inventoryStockFilter}
          onApply={(f) => setInventoryStockFilter(f)}
        />
      ) : null}
    </View>
  );
});

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
  quickFiltersWrap: { flexShrink: 0, marginBottom: 4, zIndex: 1 },
  /** Occupy remaining space so the list does not overlap chips above. */
  listFlex: { flex: 1 },
  stockFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  stockFilterRowText: { flex: 1, minWidth: 0 },
  stockFilterTitle: { fontSize: 15, fontWeight: '700' },
  stockFilterSubtitle: { fontSize: 13, marginTop: 2 },
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
