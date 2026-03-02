import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { AddReturnItemModal } from '@/components/add-return-item-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useCart } from '@/contexts/cart-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatPrice } from '@/lib/format';
import type { CartItem } from '@/types/cart';

export default function CreateOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const { items, removeItem, updateQuantity, total, currency, itemCount } = useCart();

  const [addReturnVisible, setAddReturnVisible] = useState(false);
  const [addReturnMode, setAddReturnMode] = useState<'add' | 'return'>('add');

  const openAddItem = useCallback(() => {
    setAddReturnMode('add');
    setAddReturnVisible(true);
  }, []);

  const openReturnItem = useCallback(() => {
    setAddReturnMode('return');
    setAddReturnVisible(true);
  }, []);

  const handleCheckout = useCallback(() => {
    router.push(`/company/${id}/checkout` as any);
  }, [id, router]);

  const renderCartItem = useCallback(
    ({ item }: { item: CartItem }) => {
      const isReturn = item.isReturn ?? false;
      const lineTotal = item.unit_price * item.quantity * (isReturn ? -1 : 1);
      return (
        <View style={[styles.cartCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
          <View style={styles.cartBody}>
            <View style={styles.titleRow}>
              <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.cartItemName}>
                {item.product.name}
              </ThemedText>
              {isReturn && (
                <View style={[styles.returnBadge, { backgroundColor: '#FFEBEE' }]}>
                  <ThemedText style={styles.returnBadgeText}>Return</ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={[styles.unitPrice, { color: colors.icon }]}>
              {formatPrice(item.unit_price, item.currency)} each
            </ThemedText>
          </View>
          <View style={styles.qtyRow}>
            <Pressable
              onPress={() => updateQuantity(item.product_id, item.quantity - 1, isReturn)}
              style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
            >
              <IconSymbol name="minus" size={16} color={colors.text} />
            </Pressable>
            <ThemedText style={styles.qtyText}>{item.quantity}</ThemedText>
            <Pressable
              onPress={() => updateQuantity(item.product_id, item.quantity + 1, isReturn)}
              style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
            >
              <IconSymbol name="plus" size={16} color={colors.text} />
            </Pressable>
          </View>
          <ThemedText type="defaultSemiBold" style={[styles.subtotal, isReturn && styles.subtotalReturn]}>
            {isReturn ? '-' : ''}{formatPrice(Math.abs(lineTotal), item.currency)}
          </ThemedText>
          <Pressable onPress={() => removeItem(item.product_id, isReturn)} hitSlop={8}>
            <IconSymbol name="trash" size={18} color="#C62828" />
          </Pressable>
        </View>
      );
    },
    [colors, updateQuantity, removeItem],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Create Order' }} />

      {/* Action buttons - stacked vertically */}
      <View style={styles.actions}>
        <Pressable
          onPress={openAddItem}
          style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: colors.tint }]}
        >
          <IconSymbol name="plus.circle.fill" size={22} color="#fff" />
          <ThemedText style={styles.actionText}>Add item</ThemedText>
        </Pressable>
        <Pressable
          onPress={openReturnItem}
          style={[styles.actionBtn, { borderColor: colors.tint, borderWidth: 2 }]}
        >
          <IconSymbol name="arrow.uturn.backward.circle" size={22} color={colors.tint} />
          <ThemedText style={[styles.actionTextSecondary, { color: colors.tint }]}>Return item</ThemedText>
        </Pressable>
      </View>

      {/* Cart list */}
      {items.length === 0 ? (
        <View style={styles.emptyCart}>
          <IconSymbol name="cart.fill" size={48} color={colors.icon + '50'} />
          <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
            Cart is empty. Tap Add item or Return item to scan or search.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.product_id}-${item.isReturn ?? false}`}
          renderItem={renderCartItem}
          contentContainerStyle={[styles.cartList, { paddingBottom: 120 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom bar */}
      {items.length > 0 && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.icon + '20',
              paddingBottom: 16 + insets.bottom,
            },
          ]}
        >
          <View>
            <ThemedText style={[styles.totalLabel, { color: colors.icon }]}>
              {itemCount} item{itemCount > 1 ? 's' : ''}
            </ThemedText>
            <ThemedText type="subtitle">{formatPrice(total, currency)}</ThemedText>
          </View>
          <Pressable
            onPress={handleCheckout}
            style={[styles.checkoutBtn, { backgroundColor: colors.tint }]}
          >
            <ThemedText style={styles.checkoutText}>Checkout</ThemedText>
            <IconSymbol name="chevron.right" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      <AddReturnItemModal
        visible={addReturnVisible}
        onClose={() => setAddReturnVisible(false)}
        mode={addReturnMode}
        companyId={id}
        onItemAdded={() => setAddReturnVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: {
    flexDirection: 'column',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnPrimary: {},
  actionText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  actionTextSecondary: { fontWeight: '600', fontSize: 15 },
  emptyCart: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { textAlign: 'center', lineHeight: 22 },
  cartList: { paddingHorizontal: 16, paddingBottom: 120 },
  separator: { height: 10 },
  cartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  cartBody: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cartItemName: { flex: 1 },
  returnBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  returnBadgeText: { fontSize: 11, fontWeight: '600', color: '#C62828' },
  unitPrice: { fontSize: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  subtotal: { minWidth: 70, textAlign: 'right', fontSize: 14 },
  subtotalReturn: { color: '#C62828' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 12, marginBottom: 2 },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
