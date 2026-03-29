import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/core/components/themed-view';
import { ProductListItemCell } from '@/core/components/product-list-item-cell';
import {
  ProductSearchList,
  type ProductSearchListHandle,
} from '@/core/components/product-search-list';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { exportInventoryCsv } from '@/core/services/inventory-export';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import { LOW_STOCK_THRESHOLD, type Product } from '@/core/types/product';
import { ProductDetailModal } from '../components/ProductDetailModal';

export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const listRef = useRef<ProductSearchListHandle>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const handleExportInventory = useCallback(async () => {
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
    }
  }, [id, exporting]);

  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={() => void handleExportInventory()}
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
    ),
    [colors.text, colors.tint, exporting, handleExportInventory, id],
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
          renderItem={renderInventoryCell}
        />
      </View>
      <ProductDetailModal
        product={selectedProduct}
        visible={selectedProduct != null}
        onClose={() => setSelectedProduct(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listWrap: { flex: 1 },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
});
