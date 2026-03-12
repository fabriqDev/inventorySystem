import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/core/components/themed-view';
import { ProductSearchList } from '@/core/components/product-search-list';
import { Strings } from '@/core/strings';
import type { Product } from '@/core/types/product';
import { InventoryProductCell } from '../components/InventoryProductCell';
import { ProductDetailModal } from '../components/ProductDetailModal';

const LOW_STOCK_THRESHOLD = 10;

export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const renderInventoryCell = useCallback(
    (item: Product) => (
      <InventoryProductCell
        product={item}
        onPress={setSelectedProduct}
        lowStockThreshold={LOW_STOCK_THRESHOLD}
      />
    ),
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: Strings.company.inventory }} />
      <View style={styles.listWrap}>
        <ProductSearchList
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
});
