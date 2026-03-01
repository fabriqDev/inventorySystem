import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ProductSearchList } from '@/components/product-search-list';

export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Inventory' }} />
      <ProductSearchList companyId={id} showQuantity />
    </ThemedView>
  );
}
