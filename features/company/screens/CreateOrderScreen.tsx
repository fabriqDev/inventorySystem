import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { AddReturnItemModal } from '@/core/components/add-return-item-modal';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useCart } from '@/core/context/cart-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatPrice, roundMoney } from '@/core/services/format';
import type { CartItem, CartTransactionType } from '@/core/types/cart';
import { Strings } from '@/core/strings';

const REQUEST_PURPLE = '#7B2FBE';

export default function CreateOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const { items, removeItem, updateQuantity, total, currency, itemCount } = useCart();

  const [addReturnVisible, setAddReturnVisible] = useState(false);
  const [addReturnMode, setAddReturnMode] = useState<CartTransactionType>('sale');

  // Meta fields for requested items
  const [childName, setChildName] = useState('');
  const [childClass, setChildClass] = useState('');
  const [parentPhone, setParentPhone] = useState('');

  const saleItems = useMemo(() => items.filter((i) => i.transactionType !== 'request'), [items]);
  const requestItems = useMemo(() => items.filter((i) => i.transactionType === 'request'), [items]);
  const hasRequestItems = requestItems.length > 0;
  const hasAnyItems = items.length > 0;

  const metaComplete = !hasRequestItems || (childName.trim().length > 0 && childClass.trim().length > 0);

  const openAddItem = useCallback(() => {
    setAddReturnMode('sale');
    setAddReturnVisible(true);
  }, []);

  const openReturnItem = useCallback(() => {
    setAddReturnMode('refund');
    setAddReturnVisible(true);
  }, []);

  const openRequestItem = useCallback(() => {
    setAddReturnMode('request');
    setAddReturnVisible(true);
  }, []);

  const handleCheckout = useCallback(() => {
    const params = new URLSearchParams({ id });
    if (hasRequestItems) {
      params.set('childName', childName.trim());
      params.set('childClass', childClass.trim());
      if (parentPhone.trim()) params.set('parentPhone', parentPhone.trim());
    }
    router.push(`/company/${id}/checkout?${params.toString()}` as any);
  }, [id, router, hasRequestItems, childName, childClass, parentPhone]);

  const renderCartItem = useCallback(
    (item: CartItem) => {
      const isRefund = item.transactionType === 'refund';
      const isRequest = item.transactionType === 'request';
      const lineTotal = roundMoney(item.unit_price * item.quantity * (isRefund ? -1 : 1));
      return (
        <View
          key={`${item.article_code}-${item.transactionType}`}
          style={[styles.cartCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}
        >
          <View style={styles.cartBody}>
            <View style={styles.titleRow}>
              <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.cartItemName}>
                {item.product.name}
              </ThemedText>
              {isRefund && (
                <View style={[styles.badge, { backgroundColor: '#FFEBEE' }]}>
                  <ThemedText style={[styles.badgeText, { color: '#C62828' }]}>Refund</ThemedText>
                </View>
              )}
              {isRequest && (
                <View style={[styles.badge, { backgroundColor: '#EDE7F6' }]}>
                  <ThemedText style={[styles.badgeText, { color: REQUEST_PURPLE }]}>Request</ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={[styles.unitPrice, { color: colors.icon }]}>
              {formatPrice(item.unit_price, item.currency)} each
            </ThemedText>
          </View>
          <View style={styles.qtyRow}>
            <Pressable
              onPress={() => updateQuantity(item.article_code, item.quantity - 1, item.transactionType)}
              style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
            >
              <IconSymbol name="minus" size={16} color={colors.text} />
            </Pressable>
            <ThemedText style={styles.qtyText}>{item.quantity}</ThemedText>
            <Pressable
              onPress={() => updateQuantity(item.article_code, item.quantity + 1, item.transactionType)}
              style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
            >
              <IconSymbol name="plus" size={16} color={colors.text} />
            </Pressable>
          </View>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.subtotal, isRefund && styles.subtotalReturn]}
          >
            {isRefund ? '-' : ''}{formatPrice(Math.abs(lineTotal), item.currency)}
          </ThemedText>
          <Pressable onPress={() => removeItem(item.article_code, item.transactionType)} hitSlop={8}>
            <IconSymbol name="trash" size={18} color="#C62828" />
          </Pressable>
        </View>
      );
    },
    [colors, updateQuantity, removeItem],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: Strings.company.createOrder }} />

      {/* Sale/Return action buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={openAddItem}
          style={[styles.actionBtn, { backgroundColor: colors.tint }]}
        >
          <IconSymbol name="plus.circle.fill" size={22} color="#fff" />
          <ThemedText style={styles.actionText}>Add item</ThemedText>
        </Pressable>
        <Pressable
          onPress={openReturnItem}
          style={[styles.actionBtn, { borderColor: colors.tint, borderWidth: 2 }]}
        >
          <IconSymbol name="arrow.uturn.backward.circle" size={22} color={colors.tint} />
          <ThemedText style={[styles.actionTextSecondary, { color: colors.tint }]}>{Strings.common.returnItem}</ThemedText>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.cartList, { paddingBottom: 140 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Sale / Refund items — empty hint when none added */}
        {saleItems.length === 0 ? (
          <View style={styles.emptySection}>
            <IconSymbol name="cart.fill" size={36} color={colors.icon + '40'} />
            <ThemedText style={[styles.emptySectionText, { color: colors.icon }]}>
              {Strings.company.cartEmpty}
            </ThemedText>
          </View>
        ) : (
          saleItems.map(renderCartItem)
        )}

        {/* Always-visible Requested Items section */}
        <View style={[styles.sectionSeparator, { borderColor: REQUEST_PURPLE + '40' }]}>
          <View style={[styles.sectionLine, { backgroundColor: REQUEST_PURPLE + '40' }]} />
          <View style={[styles.sectionLabelWrap, { backgroundColor: '#EDE7F6' }]}>
            <ThemedText style={[styles.sectionLabel, { color: REQUEST_PURPLE }]}>
              Requested Items
            </ThemedText>
          </View>
          <View style={[styles.sectionLine, { backgroundColor: REQUEST_PURPLE + '40' }]} />
        </View>

        {/* Add Request Item button always visible inside the section */}
        <Pressable
          onPress={openRequestItem}
          style={[styles.actionBtnInline, { backgroundColor: REQUEST_PURPLE }]}
        >
          <IconSymbol name="plus.circle.fill" size={20} color="#fff" />
          <ThemedText style={styles.actionText}>Add Request Item</ThemedText>
        </Pressable>

        {requestItems.map(renderCartItem)}

        {/* Meta fields — shown once any request items are added */}
        {hasRequestItems && (
          <View style={[styles.metaCard, { backgroundColor: colors.background, borderColor: REQUEST_PURPLE + '40' }]}>
            <ThemedText style={[styles.metaTitle, { color: REQUEST_PURPLE }]}>
              Student Details
            </ThemedText>
            <TextInput
              style={[styles.metaInput, { borderColor: colors.icon + '30', color: colors.text, backgroundColor: colors.background }]}
              placeholder="Child Name *"
              placeholderTextColor={colors.icon}
              value={childName}
              onChangeText={setChildName}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.metaInput, { borderColor: colors.icon + '30', color: colors.text, backgroundColor: colors.background }]}
              placeholder="Child Class *"
              placeholderTextColor={colors.icon}
              value={childClass}
              onChangeText={setChildClass}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.metaInput, { borderColor: colors.icon + '30', color: colors.text, backgroundColor: colors.background }]}
              placeholder="Parent Phone Number"
              placeholderTextColor={colors.icon}
              value={parentPhone}
              onChangeText={setParentPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            {!metaComplete && (
              <ThemedText style={styles.metaWarning}>
                * Child Name and Class are required to proceed.
              </ThemedText>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      {hasAnyItems && (
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
              {itemCount} {itemCount > 1 ? Strings.company.items : Strings.company.item}
            </ThemedText>
            <ThemedText type="subtitle" style={total < 0 ? styles.totalNegative : undefined}>
              {total < 0 ? `- ${formatPrice(Math.abs(total), currency)}` : formatPrice(total, currency)}
            </ThemedText>
          </View>
          <Pressable
            onPress={metaComplete ? handleCheckout : undefined}
            style={[
              styles.checkoutBtn,
              { backgroundColor: metaComplete ? colors.tint : colors.icon + '40' },
            ]}
          >
            <ThemedText style={styles.checkoutText}>{Strings.common.checkout}</ThemedText>
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
    gap: 10,
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
  actionText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  actionTextSecondary: { fontWeight: '600', fontSize: 15 },
  actionBtnInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptySection: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  emptySectionText: { textAlign: 'center', fontSize: 13 },
  cartList: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
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
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  unitPrice: { fontSize: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  subtotal: { minWidth: 70, textAlign: 'right', fontSize: 14 },
  subtotalReturn: { color: '#C62828' },
  totalNegative: { color: '#C62828' },

  // Section separator
  sectionSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 8,
  },
  sectionLine: { flex: 1, height: 1 },
  sectionLabelWrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Meta fields
  metaCard: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  metaTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  metaWarning: { fontSize: 12, color: '#C62828' },

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
