import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatPrice } from '@/core/services/format';
import { Strings } from '@/core/strings';
import { getAvailableStock } from '@/core/types/product';
import type { Product } from '@/core/types/product';

const LOW_STOCK_THRESHOLD_DEFAULT = 10;

interface InventoryProductCellProps {
  product: Product;
  onPress: (product: Product) => void;
  lowStockThreshold?: number;
}

/** Available = quantity - reserved. Shown on inventory list; shows low-stock warning when available < threshold. */
export function InventoryProductCell({
  product,
  onPress,
  lowStockThreshold = LOW_STOCK_THRESHOLD_DEFAULT,
}: InventoryProductCellProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const available = getAvailableStock(product);
  const isLowStock = available < lowStockThreshold;

  return (
    <Pressable
      onPress={() => onPress(product)}
      style={({ pressed }) => [
        styles.cell,
        { backgroundColor: colors.background, borderColor: colors.icon + '30' },
        pressed && styles.cellPressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.body}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.productName}>
            {product.name}
          </ThemedText>
          {product.size?.trim() ? (
            <ThemedText style={[styles.sizeLabel, { color: colors.icon }]}>
              Size: <ThemedText style={styles.sizeValue}>{product.size.trim()}</ThemedText>
            </ThemedText>
          ) : null}
          <ThemedText style={[styles.code, { color: colors.icon }]}>
            Code: {product.scan_code}
          </ThemedText>
        </View>
        <View style={styles.right}>
          <ThemedText style={[styles.availableLabel, { color: colors.icon }]}>
            {Strings.company.available}: {available}
          </ThemedText>
          <ThemedText style={[styles.price, { color: colors.tint }]}>
            {formatPrice(product.price, product.currency)}
          </ThemedText>
        </View>
      </View>
      {isLowStock && (
        <ThemedText style={[styles.lowStock, { color: '#C62828' }]}>
          {Strings.company.productStockLow}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  cellPressed: { opacity: 0.7 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: { flex: 1, gap: 2 },
  productName: { fontSize: 15 },
  sizeLabel: { fontSize: 12 },
  sizeValue: { fontWeight: '600', fontSize: 12 },
  code: { fontSize: 12 },
  right: { alignItems: 'flex-end', marginLeft: 12, gap: 2 },
  availableLabel: { fontSize: 13 },
  price: { fontSize: 13, fontWeight: '600' },
  lowStock: { fontSize: 12, fontWeight: '600' },
});
