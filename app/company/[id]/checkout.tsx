import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { useDataSource } from '@/contexts/data-source-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createOrder } from '@/lib/api/orders';
import type { CreateOrderInput, CreateOrderItemInput } from '@/lib/backend/types';
import { formatPrice } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { CartItem } from '@/types/cart';

/** Build order items with positive values for backend; transaction_type is sale | return (refund mapped to return). */
function cartToOrderItems(items: CartItem[]): CreateOrderItemInput[] {
  return items.map((item) => {
    const lineTotal = item.unit_price * item.quantity;
    return {
      product_id: item.product_id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      transaction_type: item.transactionType === 'refund' ? 'return' : 'sale',
      tax_percentage: 0,
      tax_amount: 0,
      total: lineTotal,
    };
  });
}

export default function CheckoutScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: companyId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { items, total, currency, clearCart } = useCart();
  const { useMockData } = useDataSource();

  const [submitting, setSubmitting] = useState(false);

  const userId = session?.user?.id ?? '';

  useEffect(() => {
    if (items.length === 0) {
      router.replace(`/company/${companyId}/create-order` as any);
    }
  }, [items.length, companyId, router]);

  const runCashOrder = useCallback(async () => {
    if (!companyId || !userId || items.length === 0 || total <= 0) {
      if (!userId) toast.show({ type: 'error', message: 'Please sign in to place an order.' });
      return;
    }
    setSubmitting(true);
    try {
      const orderInput: CreateOrderInput = {
        company_id: companyId,
        user_id: userId,
        subtotal: total,
        tax_amount: 0,
        total,
        payment_method: 'cash',
        order_items: cartToOrderItems(items),
      };
      const result = await createOrder(orderInput, useMockData);
      if (result == null) {
        toast.show({ type: 'error', message: 'Order could not be completed. Please try again.' });
        return;
      }
      clearCart();
      toast.show({ type: 'success', message: 'Order placed successfully.' });
      router.back();
    } finally {
      setSubmitting(false);
    }
  }, [companyId, userId, items, total, useMockData, clearCart, router]);

  const runCompleteOrder = useCallback(async () => {
    if (!companyId || !userId || items.length === 0 || total > 0) return;
    setSubmitting(true);
    try {
      const orderInput: CreateOrderInput = {
        company_id: companyId,
        user_id: userId,
        subtotal: total,
        tax_amount: 0,
        total,
        payment_method: 'complete',
        order_items: cartToOrderItems(items),
      };
      const result = await createOrder(orderInput, useMockData);
      if (result == null) {
        toast.show({ type: 'error', message: 'Order could not be completed. Please try again.' });
        return;
      }
      clearCart();
      toast.show({ type: 'success', message: 'Order completed successfully.' });
      router.back();
    } finally {
      setSubmitting(false);
    }
  }, [companyId, userId, items, total, useMockData, clearCart, router]);

  const handleOnline = useCallback(() => {
    toast.show({ type: 'info', message: 'Online payment (Razorpay) will be available soon.' });
  }, []);

  if (items.length === 0) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <ActivityIndicator size="large" color={colors.tint} />
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>Redirecting...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, styles.containerScroll, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen options={{ title: 'Checkout' }} />
      <ThemedText type="title" style={styles.title}>
        Checkout
      </ThemedText>
      <ThemedText style={[styles.subtitle, { color: colors.icon, marginBottom: 24 }]}>
        {total > 0 ? 'Pay with' : 'Complete order'}
      </ThemedText>

      <View style={styles.actions}>
        {total > 0 ? (
          <>
            <Pressable
              onPress={runCashOrder}
              disabled={submitting}
              style={[
                styles.optionBtn,
                { backgroundColor: colors.tint, borderColor: colors.tint },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="banknote" size={24} color="#fff" />
                  <ThemedText style={styles.optionBtnTextPrimary}>Cash</ThemedText>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleOnline}
              disabled={submitting}
              style={[styles.optionBtn, { backgroundColor: colors.background, borderColor: colors.icon + '40' }]}
            >
              <IconSymbol name="creditcard" size={24} color={colors.text} />
              <ThemedText style={[styles.optionBtnText, { color: colors.text }]}>Online</ThemedText>
              <ThemedText style={[styles.optionHint, { color: colors.icon }]}>Razorpay coming soon</ThemedText>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={runCompleteOrder}
            disabled={submitting}
            style={[
              styles.optionBtn,
              { backgroundColor: colors.tint, borderColor: colors.tint },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <IconSymbol name="checkmark.circle.fill" size={24} color="#fff" />
                <ThemedText style={styles.optionBtnTextPrimary}>Complete order</ThemedText>
              </>
            )}
          </Pressable>
        )}
      </View>

      <View style={[styles.footer, { borderTopColor: colors.icon + '20' }]}>
        <ThemedText style={[styles.totalLabel, { color: colors.icon }]}>Total</ThemedText>
        <ThemedText type="subtitle" style={styles.totalValue}>
          {total >= 0 ? '' : '-'}{formatPrice(Math.abs(total), currency)}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  containerScroll: {
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
  },
  title: { marginTop: 12 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  actions: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  optionBtnTextPrimary: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  optionBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
  optionHint: {
    fontSize: 12,
    marginLeft: 4,
  },
  footer: {
    width: '100%',
    paddingTop: 16,
    marginTop: 'auto',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 18, fontWeight: '700' },
});
