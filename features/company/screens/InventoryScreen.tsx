import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { ConfirmActionModal } from '@/core/components/confirm-action-modal';
import { ThemedView } from '@/core/components/themed-view';
import { ProductListItemCell } from '@/core/components/product-list-item-cell';
import {
  ProductSearchList,
  type ProductSearchListHandle,
} from '@/core/components/product-search-list';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { exportInventoryCsv } from '@/core/services/inventory-export';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import { LOW_STOCK_THRESHOLD, type InventoryStockFilter, type Product } from '@/core/types/product';
import { ProductDetailModal } from '../components/ProductDetailModal';

export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshProducts } = useProductCache();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const listRef = useRef<ProductSearchListHandle>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void refreshProducts(id);
    }, [id, refreshProducts]),
  );
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportConfirmVisible, setExportConfirmVisible] = useState(false);
  const [inventoryStockFilterActive, setInventoryStockFilterActive] = useState(false);

  const onInventoryStockFilterChange = useCallback((filter: InventoryStockFilter | null) => {
    setInventoryStockFilterActive(filter != null);
  }, []);

  const renderInventoryCell = useCallback(
    (item: Product) => (
      <ProductListItemCell
        product={item}
        showQuantity
        onPress={setSelectedProduct}
        lowStockThreshold={LOW_STOCK_THRESHOLD}
      />
    ),
    [],
  );

  const runExportInventory = useCallback(async () => {
    if (!id || exporting) return;
    setExporting(true);
    try {
      const products = listRef.current?.getProductsForExport() ?? [];
      const res = await exportInventoryCsv(products, id);
      if (res.ok) {
        toast.show({ type: 'success', message: Strings.company.inventoryExportSuccess });
      } else if (res.reason === 'empty') {
        toast.show({ type: 'info', message: Strings.company.inventoryExportEmpty });
      } else {
        toast.show({ type: 'error', message: Strings.company.inventoryExportError });
      }
    } catch {
      toast.show({ type: 'error', message: Strings.company.inventoryExportError });
    } finally {
      setExporting(false);
      setExportConfirmVisible(false);
    }
  }, [id, exporting]);

  const headerRight = useCallback(
    () => (
      <View style={styles.headerRightRow}>
        <Pressable
          onPress={() => setExportConfirmVisible(true)}
          disabled={exporting || !id}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={Strings.company.inventoryDownloadExcelA11y}
          style={styles.headerBtn}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <IconSymbol name="square.and.arrow.down" size={22} color={colors.text} />
          )}
        </Pressable>
        <Pressable
          onPress={() => listRef.current?.openInventoryStockFilter()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={Strings.company.inventoryStockFilterButton}
          style={styles.headerBtn}
        >
          <View style={styles.filterIconWrap}>
            <IconSymbol name="line.3.horizontal.decrease.circle" size={22} color={colors.tint} />
            {inventoryStockFilterActive ? (
              <View
                style={[
                  styles.stockFilterActiveDot,
                  { backgroundColor: '#C62828', borderColor: colors.background },
                ]}
              />
            ) : null}
          </View>
        </Pressable>
      </View>
    ),
    [colors.background, colors.text, colors.tint, exporting, id, inventoryStockFilterActive],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: Strings.company.inventory,
          headerRight,
        }}
      />
      <View style={styles.listWrap}>
        <ProductSearchList
          ref={listRef}
          companyId={id}
          showQuantity
          variant="inventory"
          hideInventoryQuantityFilterRow
          onInventoryStockFilterChange={onInventoryStockFilterChange}
          renderItem={renderInventoryCell}
        />
      </View>
      <ProductDetailModal
        product={selectedProduct}
        visible={selectedProduct != null}
        onClose={() => setSelectedProduct(null)}
      />
      <ConfirmActionModal
        visible={exportConfirmVisible}
        onClose={() => {
          if (!exporting) setExportConfirmVisible(false);
        }}
        title={Strings.company.inventoryExportConfirmTitle}
        message={Strings.company.inventoryExportConfirmMessage}
        cancelLabel={Strings.common.cancel}
        confirmLabel={Strings.company.inventoryExportConfirmDownload}
        confirmColor={colors.tint}
        loading={exporting}
        onConfirm={() => void runExportInventory()}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listWrap: { flex: 1 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
  filterIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockFilterActiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
});
