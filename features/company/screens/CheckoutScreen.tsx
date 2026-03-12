import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createOrder } from '@/core/api/orders';
import type { CreateOrderInput, CreateOrderItemInput } from '@/core/backend/types';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useAuth } from '@/core/context/auth-context';
import { useCart } from '@/core/context/cart-context';
import { useCompany } from '@/core/context/company-context';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatPrice } from '@/core/services/format';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import type { CartItem } from '@/core/types/cart';
import type { PaymentMethod } from '@/core/types/order';

/** Single checkout line: article name, size below, and right side "qty × unit price = subtotal". No quantity controls. */
function CheckoutItemCell({
  item,
  lineTotal,
  colors,
  isRefund,
  stockError,
  borderColor,
}: {
  item: CartItem;
  lineTotal: number;
  colors: { text: string; icon: string; background: string };
  isRefund: boolean;
  stockError?: string;
  borderColor?: string;
}) {
  const unitAmount = (item.unit_price / 100).toFixed(2);
  const totalAmount = (Math.abs(lineTotal) / 100).toFixed(2);
  const formulaPrefix = `${item.quantity} × ${unitAmount} =`;
  const size = item.product.size?.trim();

  return (
    <View
      style={[
        styles.itemCard,
        { backgroundColor: colors.background, borderColor: borderColor ?? colors.icon + '25' },
      ]}
    >
      <View style={styles.checkoutItemRow}>
        <View style={styles.checkoutItemLeft}>
          <View style={styles.itemTitleRow}>
            <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.itemName}>
              {item.product.name}
            </ThemedText>
            {isRefund && (
              <View style={[styles.refundBadge, { backgroundColor: '#FFEBEE' }]}>
                <ThemedText style={styles.refundBadgeText}>Refund</ThemedText>
              </View>
            )}
          </View>
          {size ? (
            <View style={styles.checkoutSizeRow}>
              <ThemedText style={[styles.checkoutArticleCode, { color: colors.icon }]}>
                size:{' '}
              </ThemedText>
              <ThemedText type="defaultSemiBold" style={[styles.checkoutArticleCode, { color: colors.icon }]}>
                {size}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.checkoutFormulaRow}>
          <ThemedText
            style={[styles.checkoutFormula, styles.checkoutFormulaPrefix, isRefund && { color: '#C62828' }]}
            numberOfLines={1}
          >
            {isRefund ? '- ' : ''}{formulaPrefix}
            {' '}
            <ThemedText type="defaultSemiBold" style={[styles.checkoutFormula, isRefund && { color: '#C62828' }]}>
              {totalAmount}
            </ThemedText>
          </ThemedText>
        </View>
      </View>
      {stockError && (
        <ThemedText style={styles.stockError}>{stockError}</ThemedText>
      )}
    </View>
  );
}

/** Build order items with positive values for backend; transaction_type is sale | refund. */
function cartToOrderItems(items: CartItem[]): CreateOrderItemInput[] {
  return items.map((item) => {
    const lineTotal = item.unit_price * item.quantity;
    return {
      article_code: item.product.article_code,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      transaction_type: item.transactionType === 'refund' ? 'refund' : 'sale',
      tax_percentage: 0,
      tax_amount: 0,
      total: lineTotal,
    };
  });
}

/** Cart items in receipt shape for passing to Receipt Preview (includes article_code and size for print). */
function cartToReceiptItems(
  items: CartItem[]
): { product_name: string; size?: string; article_code?: string; quantity: number; unit_price: number; total: number }[] {
  return items.map((item) => ({
    product_name: item.product.name,
    size: item.product.size,
    article_code: item.product.scan_code ?? item.product.article_code,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.unit_price * item.quantity,
  }));
}

export default function CheckoutScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: companyId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { items, total, currency, clearCart } = useCart();
  const { selectedCompany } = useCompany();
  const { useMockData } = useDataSource();
  const { getCachedProducts } = useProductCache();

  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  /** When true, we are navigating to receipt after success; skip empty-cart redirect so receipt screen shows. */
  const navigatingToReceiptRef = useRef(false);

  const userId = session?.user?.id ?? '';
  const showOnlinePG = selectedCompany?.razorpay_id != null && selectedCompany?.razorpay_id !== '';

  const availableStock = useMemo(() => {
    const products = getCachedProducts(companyId);
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.article_code, Math.max(0, (p.quantity ?? 0) - (p.reserved ?? 0)));
    }
    return map;
  }, [getCachedProducts, companyId]);

  const hasStockError = useMemo(
    () =>
      items.some((item) => {
        if (item.transactionType === 'refund') return false;
        const avail = availableStock.get(item.article_code);
        return avail != null && item.quantity > avail;
      }),
    [items, availableStock],
  );

  useEffect(() => {
    if (items.length === 0 && !navigatingToReceiptRef.current) {
      router.replace(`/company/${companyId}/create-order` as any);
    }
    if (items.length === 0 && navigatingToReceiptRef.current) {
      navigatingToReceiptRef.current = false;
    }
  }, [items.length, companyId, router]);

  const submitOrder = useCallback(
    async (payment_method: PaymentMethod) => {
      if (!companyId || !userId || items.length === 0) {
        if (!userId) toast.show({ type: 'error', message: Strings.company.pleaseSignInToPlaceOrder });
        return;
      }
      setOrderError(null);
      const receiptItems = cartToReceiptItems(items);
      setSubmitting(true);
      try {
        const orderInput: CreateOrderInput = {
          company_id: companyId,
          user_id: userId,
          subtotal: total,
          tax_amount: 0,
          total,
          payment_method,
          order_items: cartToOrderItems(items),
        };
        const result = await createOrder(orderInput, useMockData);
        if (result == null) {
          setOrderError('Order could not be completed. Please try again.');
          return;
        }
        const serverOrderId = result.server_order_id;
        if (Platform.OS === 'web') {
          navigatingToReceiptRef.current = true;
          clearCart();
          toast.show({ type: 'success', message: Strings.company.orderPlacedSuccess });
          setShowPaymentChoice(false);
          router.dismissTo(`/company/${companyId}` as any);
        } else {
          navigatingToReceiptRef.current = true;
          clearCart();
          toast.show({ type: 'success', message: Strings.company.orderPlacedSuccess });
          setShowPaymentChoice(false);
          const itemsJson = encodeURIComponent(JSON.stringify(receiptItems));
          router.replace({
            pathname: '/company/[id]/receipt-preview',
            params: {
              id: companyId,
              orderId: serverOrderId,
              total: String(result.total),
              paymentMethod: payment_method,
              itemsJson,
              currency,
            },
          } as any);
        }
      } catch (e: any) {
        const msg = e?.detail ?? e?.message ?? Strings.company.somethingWentWrongTryAgain;
        setOrderError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [companyId, userId, items, total, useMockData, clearCart, router],
  );

  const handleCollectPayment = useCallback(() => {
    setShowPaymentChoice(true);
  }, []);

  const handlePaymentChoice = useCallback(
    (method: 'cash' | 'online') => {
      setShowPaymentChoice(false);
      submitOrder(method);
    },
    [submitOrder]
  );

  const handleOnlinePG = useCallback(() => {
    submitOrder('rz_pg');
  }, [submitOrder]);

  /** For negative totals (refunds): complete order with cash, no payment choice popup. */
  const handleCompleteOrder = useCallback(() => {
    submitOrder('cash');
  }, [submitOrder]);

  const isRefund = total < 0;

  if (items.length === 0) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <ActivityIndicator size="large" color={colors.tint} />
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>{Strings.common.redirecting}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ title: 'Checkout' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          Checkout
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
          {isRefund ? Strings.company.completeRefundOrder : Strings.company.reviewAndCollect}
        </ThemedText>

        {/* ---- Order items (read-only: name, article code, qty × price = subtotal) ---- */}
        <View style={styles.itemsSection}>
          {items.map((item) => {
            const isItemRefund = item.transactionType === 'refund';
            const lineTotal = item.unit_price * item.quantity * (isItemRefund ? -1 : 1);
            const avail = availableStock.get(item.article_code);
            const exceedsStock = !isItemRefund && avail != null && item.quantity > avail;
            const stockError = exceedsStock
              ? Strings.company.onlyAvailable.replace('{count}', String(avail))
              : undefined;
            return (
              <CheckoutItemCell
                key={`${item.article_code}-${item.transactionType}`}
                item={item}
                lineTotal={lineTotal}
                colors={colors}
                isRefund={isItemRefund}
                stockError={stockError}
                borderColor={exceedsStock ? '#C62828' : undefined}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* ---- Fixed bottom bar ---- */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.background, borderTopColor: colors.icon + '20', paddingBottom: 16 + insets.bottom },
        ]}
      >
        <View style={styles.bottomTotalRow}>
          <ThemedText style={[styles.totalLabel, { color: colors.icon }]}>{Strings.company.total}</ThemedText>
          <ThemedText type="subtitle" style={[styles.totalValue, total < 0 && { color: '#C62828' }]}>
            {total < 0 ? '- ' : ''}{formatPrice(Math.abs(total), currency)}
          </ThemedText>
        </View>

        {hasStockError && (
          <ThemedText style={styles.stockWarning}>
            {Strings.company.reduceQuantity}
          </ThemedText>
        )}

        {orderError && (
          <Pressable onPress={() => setOrderError(null)} style={styles.orderErrorBanner}>
            <ThemedText style={styles.orderErrorText}>{orderError}</ThemedText>
          </Pressable>
        )}

        <View style={styles.actions}>
          {isRefund ? (
            <Pressable
              onPress={handleCompleteOrder}
              disabled={submitting || hasStockError}
              style={[
                styles.optionBtn,
                { backgroundColor: hasStockError ? colors.icon + '40' : colors.tint, borderColor: hasStockError ? colors.icon + '40' : colors.tint },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="checkmark.circle.fill" size={24} color="#fff" />
                  <ThemedText style={styles.optionBtnTextPrimary}>{Strings.company.completeOrder}</ThemedText>
                </>
              )}
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleCollectPayment}
                disabled={submitting || hasStockError}
                style={[
                  styles.optionBtn,
                  { backgroundColor: hasStockError ? colors.icon + '40' : colors.tint, borderColor: hasStockError ? colors.icon + '40' : colors.tint },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconSymbol name="banknote" size={24} color="#fff" />
                    <ThemedText style={styles.optionBtnTextPrimary}>{Strings.company.collectPayment}</ThemedText>
                  </>
                )}
              </Pressable>

              {showOnlinePG && (
                <Pressable
                  onPress={handleOnlinePG}
                  disabled={submitting || hasStockError}
                  style={[styles.optionBtn, { backgroundColor: colors.background, borderColor: colors.icon + '40' }]}
                >
                  <IconSymbol name="creditcard" size={24} color={colors.text} />
                  <ThemedText style={[styles.optionBtnText, { color: colors.text }]}>{Strings.company.onlinePg}</ThemedText>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>

      {submitting && (
        <View style={[StyleSheet.absoluteFill, styles.loaderOverlay]}>
          <View style={[styles.loaderBox, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.tint} />
            <ThemedText style={[styles.loaderText, { color: colors.text }]}>
              {Strings.common.creatingOrder}
            </ThemedText>
          </View>
        </View>
      )}

      <Modal
        visible={showPaymentChoice}
        animationType="fade"
        transparent
        onRequestClose={() => !submitting && setShowPaymentChoice(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowPaymentChoice(false)}>
          <View
            style={[styles.choiceModal, { backgroundColor: colors.background }]}
            onStartShouldSetResponder={() => true}
          >
            <ThemedText type="subtitle" style={styles.choiceModalTitle}>
              {Strings.company.collectPayment}
            </ThemedText>
            <ThemedText style={[styles.choiceModalHint, { color: colors.icon }]}>
              {Strings.company.choosePaymentMethod}
            </ThemedText>
            <Pressable
              onPress={() => handlePaymentChoice('cash')}
              style={[styles.choiceBtn, { backgroundColor: colors.tint }]}
            >
              <IconSymbol name="banknote" size={22} color="#fff" />
              <ThemedText style={styles.choiceBtnTextPrimary}>{Strings.company.cash}</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => handlePaymentChoice('online')}
              style={[styles.choiceBtnOutlined, { borderColor: colors.icon + '40' }]}
            >
              <ThemedText style={{ color: colors.text }}>{Strings.company.online}</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setShowPaymentChoice(false)}
              style={[styles.choiceCancel, { borderColor: colors.icon + '40' }]}
            >
              <ThemedText style={{ color: colors.icon }}>{Strings.common.cancel}</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 16 },
  title: { marginTop: 12 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  /* ---- Item cards (checkout: name + article code, right: qty × price = subtotal) ---- */
  itemsSection: { gap: 10, marginBottom: 16 },
  itemCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  checkoutItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  checkoutItemLeft: { flex: 1, minWidth: 0, gap: 2 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemName: { flex: 1 },
  checkoutSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  checkoutArticleCode: { fontSize: 12 },
  checkoutFormulaRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', flexShrink: 0 },
  checkoutFormula: { fontSize: 13 },
  checkoutFormulaPrefix: { fontWeight: '400', textAlign: 'right' },
  refundBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  refundBadgeText: { fontSize: 11, fontWeight: '600', color: '#C62828' },
  stockError: { color: '#C62828', fontSize: 12, marginTop: 6 },
  /* ---- Bottom bar ---- */
  bottomBar: { borderTopWidth: 1, paddingHorizontal: 24, paddingTop: 12 },
  bottomTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stockWarning: { color: '#C62828', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  orderErrorBanner: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  orderErrorText: { color: '#C62828', fontSize: 13, lineHeight: 18 },
  actions: {
    width: '100%',
    gap: 12,
    marginBottom: 8,
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
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 18, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  choiceModal: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    gap: 14,
  },
  choiceModalTitle: {
    textAlign: 'center',
  },
  choiceModalHint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
  },
  choiceBtnTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  choiceBtnOutlined: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  choiceCancel: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  loaderOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loaderBox: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 16,
  },
});
