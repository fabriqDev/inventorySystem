import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ProductSearchList } from '@/components/product-search-list';

export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Inventory' }} />
      <View style={styles.listWrap}>
        <ProductSearchList companyId={id} showQuantity />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listWrap: { flex: 1 },
});
