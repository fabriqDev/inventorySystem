import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatPrice } from '@/core/services/format';
import { Strings } from '@/core/strings';
import { getAvailableStock, type Product } from '@/core/types/product';

export interface ProductListItemCellProps {
  product: Product;
  /** When true and `product.quantity` is set, third row shows available count; otherwise price. */
  showQuantity?: boolean;
  onPress?: (product: Product) => void;
  /** When set (e.g. inventory), show “Product stock low” on the qty row when available is below threshold (and not zero). */
  lowStockThreshold?: number;
}

/**
 * Shared product row: name (2 lines), code | size row, then available qty | not available or price.
 * Used by product search list and inventory.
 */
export function ProductListItemCell({
  product,
  showQuantity = false,
  onPress,
  lowStockThreshold,
}: ProductListItemCellProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const available = getAvailableStock(product);
  const outOfStock = available === 0;
  const isLowStock =
    typeof lowStockThreshold === 'number' &&
    !outOfStock &&
    available < lowStockThreshold;

  return (
    <Pressable
      onPress={() => onPress?.(product)}
      style={({ pressed }) => [
        styles.card,
        outOfStock
          ? {
              backgroundColor: colors.outOfStockSurface,
              borderColor: colors.outOfStockBorder,
            }
          : { backgroundColor: colors.background, borderColor: colors.icon + '30' },
        pressed && onPress && styles.cardPressed,
      ]}
    >
      <View style={styles.cardBody}>
        <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.productName}>
          {product.name}
        </ThemedText>

        <View style={styles.cardRow}>
          <View style={styles.cardRowLeft}>
            <ThemedText style={[styles.metaLine, { color: colors.icon }]} numberOfLines={1}>
              {Strings.company.productListArticleCodeLabel}{' '}
              <ThemedText type="defaultSemiBold" style={[styles.metaValue, { color: colors.text }]}>
                {product.scan_code}
              </ThemedText>
            </ThemedText>
          </View>
          <View style={styles.cardRowRight}>
            {product.size?.trim() ? (
              <ThemedText style={[styles.metaLine, { color: colors.icon }]} numberOfLines={1}>
                {Strings.company.size}:{' '}
                <ThemedText type="defaultSemiBold" style={[styles.metaValue, { color: colors.text }]}>
                  {product.size.trim()}
                </ThemedText>
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={styles.cardRow}>
          {showQuantity && product.quantity != null ? (
            <>
              <View style={styles.cardRowLeft}>
                <ThemedText style={[styles.metaLine, { color: colors.icon }]} numberOfLines={1}>
                  {Strings.company.productListAvailableQtyLabel}{' '}
                  <ThemedText type="defaultSemiBold" style={[styles.metaValue, { color: colors.text }]}>
                    {available}
                  </ThemedText>
                </ThemedText>
              </View>
              <View style={styles.cardRowRight}>
                {outOfStock ? (
                  <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.stockStatusLabel}>
                    {Strings.company.productNotAvailable}
                  </ThemedText>
                ) : isLowStock ? (
                  <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.stockStatusLabel}>
                    {Strings.company.productStockLow}
                  </ThemedText>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.cardRowLeft} />
              <View style={styles.cardRowRight}>
                <View style={[styles.priceBadge, { backgroundColor: colors.tint + '15' }]}>
                  <ThemedText style={[styles.priceText, { color: colors.tint }]}>
                    {formatPrice(product.price, product.currency)}
                  </ThemedText>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardPressed: { opacity: 0.7 },
  cardBody: { width: '100%', gap: 8 },
  productName: { fontSize: 15, lineHeight: 20 },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  cardRowLeft: { flex: 1, minWidth: 0 },
  cardRowRight: { flexShrink: 0, maxWidth: '50%', alignItems: 'flex-end' },
  metaLine: { fontSize: 12, lineHeight: 16 },
  metaValue: { fontSize: 12, lineHeight: 16 },
  /** Right side of qty row: “Not available” OR “Product stock low” (mutually exclusive). */
  stockStatusLabel: { fontSize: 12, lineHeight: 16, color: '#C62828', textAlign: 'right' },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priceText: { fontSize: 13, fontWeight: '600' },
});
