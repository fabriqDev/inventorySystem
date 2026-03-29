import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createOrder, createRazorpayOrder, updateOrderStatus, verifyRazorpayPayment } from '@/core/api/orders';
import type { CreateOrderInput, CreateOrderItemInput, OrderCheckoutBuyerDetails } from '@/core/backend/types';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Colors } from '@/core/constants/theme';
import { useAuth } from '@/core/context/auth-context';
import { useCart } from '@/core/context/cart-context';
import { useCompany } from '@/core/context/company-context';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useCompanyConfig } from '@/core/hooks/use-company-config';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatAmount, formatPrice, roundMoney } from '@/core/services/format';
import { openRazorpayCheckout, RazorpayError } from '@/core/services/razorpay';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import type { CartItem } from '@/core/types/cart';
import { OrderStatus } from '@/core/types/order';
import { CheckoutButton, type PaymentButtonToShowEnum, getOrderPaymentForCheckout } from '@/core/types/order';
import { getAvailableStock } from '@/core/types/product';

type PaymentStatusState =
  | { phase: 'processing' }
  | { phase: 'verifying' }
  | { phase: 'success' }
  | { phase: 'failed'; message: string }
  | { phase: 'verify_failed'; message: string }
  | { phase: 'cancelled' }
  | null;

/** Distinct filled colors for each payment option in the modal (Cash uses theme tint). */
const PAYMENT_COLORS = {
  online: '#059669',
  split: '#7c3aed',
  razorpay: '#2563eb',
};

const CHECKOUT_REQUEST_PURPLE = '#7B2FBE';

/** Single checkout line: article name, size below, and right side "qty × unit price = subtotal". No quantity controls. */
function CheckoutItemCell({
  item,
  lineTotal,
  colors,
  isRefund,
  isRequest,
  stockError,
  borderColor,
}: {
  item: CartItem;
  lineTotal: number;
  colors: { text: string; icon: string; background: string };
  isRefund: boolean;
  isRequest?: boolean;
  stockError?: string;
  borderColor?: string;
}) {
  const unitAmount = formatAmount(item.unit_price);
  const totalAmount = formatAmount(Math.abs(lineTotal));
  const formulaPrefix = `${item.quantity} × ${unitAmount} =`;
  const size = item.product.size?.trim();
  const codeLabel =
    item.product.scan_code?.trim() || item.product.article_code?.trim() || '';

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
          {codeLabel ? (
            <ThemedText style={[styles.checkoutArticleCode, { color: colors.icon }]}>
              Code: {codeLabel}
            </ThemedText>
          ) : null}
          {(isRefund || isRequest) && (
            <View style={styles.checkoutBadgeRow}>
              {isRefund && (
                <View style={[styles.refundBadge, { backgroundColor: '#FFEBEE' }]}>
                  <ThemedText style={styles.refundBadgeText}>{Strings.company.refund}</ThemedText>
                </View>
              )}
              {isRequest && (
                <View style={[styles.refundBadge, { backgroundColor: '#EDE7F6' }]}>
                  <ThemedText style={[styles.refundBadgeText, { color: CHECKOUT_REQUEST_PURPLE }]}>
                    {Strings.company.requestBadge}
                  </ThemedText>
                </View>
              )}
            </View>
          )}
        </View>
        <View style={styles.checkoutFormulaRow}>
          <ThemedText
            style={[styles.checkoutFormula, styles.checkoutFormulaPrefix, isRefund && { color: '#C62828' }, isRequest && { color: CHECKOUT_REQUEST_PURPLE }]}
            numberOfLines={1}
          >
            {isRefund ? '- ' : ''}{formulaPrefix}
            {' '}
            <ThemedText type="defaultSemiBold" style={[styles.checkoutFormula, isRefund && { color: '#C62828' }, isRequest && { color: CHECKOUT_REQUEST_PURPLE }]}>
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

/** Build order items with positive values for backend; transaction_type is sale | refund | request. */
function cartToOrderItems(
  items: CartItem[],
  requestDetails?: { name: string; class: string; phone?: string },
): CreateOrderItemInput[] {
  return items.map((item) => {
    const lineTotal = roundMoney(item.unit_price * item.quantity);
    return {
      article_code: item.product.article_code,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      transaction_type: item.transactionType,
      tax_percentage: 0,
      tax_amount: 0,
      total: lineTotal,
      ...(item.transactionType === 'request' && requestDetails
        ? { request_details: requestDetails }
        : {}),
    };
  });
}

/** Cart items in receipt shape for passing to Receipt Preview (includes article_code, size, and line type for print). */
function cartToReceiptItems(items: CartItem[]) {
  return items.map((item) => {
    const lineTotal = roundMoney(item.unit_price * item.quantity);
    return {
      product_name: item.product.name,
      size: item.product.size,
      article_code: item.product.scan_code ?? item.product.article_code,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.transactionType === 'refund' ? -lineTotal : lineTotal,
      transaction_type: item.transactionType,
    };
  });
}

function AnimatedCheckmark({ color }: { color: string }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 120 });
    opacity.value = withTiming(1, { duration: 300 });
  }, [scale, opacity]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={[paymentStatusStyles.iconCircle, { backgroundColor: '#E8F5E9' }, animStyle]}>
      <IconSymbol name="checkmark" size={40} color={color} />
    </Animated.View>
  );
}

function AnimatedCross({ color }: { color: string }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.15, { damping: 6, stiffness: 140 }),
      withSpring(1, { damping: 10 }),
    );
    opacity.value = withTiming(1, { duration: 300 });
  }, [scale, opacity]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={[paymentStatusStyles.iconCircle, { backgroundColor: '#FFEBEE' }, animStyle]}>
      <IconSymbol name="xmark" size={40} color={color} />
    </Animated.View>
  );
}

function PaymentStatusOverlay({
  status,
  onRetry,
  onRetryVerify,
  onCancel,
  colors,
}: {
  status: PaymentStatusState;
  onRetry: () => void;
  onRetryVerify: () => void;
  onCancel: () => void;
  colors: { text: string; icon: string; background: string; tint: string };
}) {
  if (!status) return null;
  return (
    <View style={[StyleSheet.absoluteFill, paymentStatusStyles.overlay]}>
      <View style={[paymentStatusStyles.card, { backgroundColor: colors.background }]}>
        {status.phase === 'processing' && (
          <>
            <ActivityIndicator size="large" color={colors.tint} />
            <ThemedText style={paymentStatusStyles.title}>Processing payment...</ThemedText>
            <ThemedText style={[paymentStatusStyles.hint, { color: colors.icon }]}>
              Please do not close the app.
            </ThemedText>
          </>
        )}
        {status.phase === 'verifying' && (
          <>
            <ActivityIndicator size="large" color={colors.tint} />
            <ThemedText style={paymentStatusStyles.title}>Verifying payment...</ThemedText>
            <ThemedText style={[paymentStatusStyles.hint, { color: colors.icon }]}>
              Please do not close the app.
            </ThemedText>
          </>
        )}
        {status.phase === 'success' && (
          <>
            <AnimatedCheckmark color="#2E7D32" />
            <ThemedText style={paymentStatusStyles.title}>Payment successful</ThemedText>
          </>
        )}
        {status.phase === 'failed' && (
          <>
            <AnimatedCross color="#C62828" />
            <ThemedText style={paymentStatusStyles.title}>Payment failed</ThemedText>
            <ThemedText style={[paymentStatusStyles.hint, { color: colors.icon }]}>
              {status.message}
            </ThemedText>
            <Pressable onPress={onRetry} style={[paymentStatusStyles.retryBtn, { backgroundColor: colors.tint }]}>
              <ThemedText style={paymentStatusStyles.retryBtnText}>Retry payment</ThemedText>
            </Pressable>
            <Pressable onPress={onCancel} style={paymentStatusStyles.cancelBtn}>
              <ThemedText style={{ color: colors.icon }}>Cancel</ThemedText>
            </Pressable>
          </>
        )}
        {status.phase === 'verify_failed' && (
          <>
            <AnimatedCross color="#E65100" />
            <ThemedText style={paymentStatusStyles.title}>Verification failed</ThemedText>
            <ThemedText style={[paymentStatusStyles.hint, { color: colors.icon }]}>
              {status.message}
            </ThemedText>
            <Pressable onPress={onRetryVerify} style={[paymentStatusStyles.retryBtn, { backgroundColor: colors.tint }]}>
              <ThemedText style={paymentStatusStyles.retryBtnText}>Retry verification</ThemedText>
            </Pressable>
            <Pressable onPress={onCancel} style={paymentStatusStyles.cancelBtn}>
              <ThemedText style={{ color: colors.icon }}>Check orders</ThemedText>
            </Pressable>
          </>
        )}
        {status.phase === 'cancelled' && (
          <>
            <AnimatedCross color="#E65100" />
            <ThemedText style={paymentStatusStyles.title}>Payment cancelled</ThemedText>
            <Pressable onPress={onRetry} style={[paymentStatusStyles.retryBtn, { backgroundColor: colors.tint }]}>
              <ThemedText style={paymentStatusStyles.retryBtnText}>Retry payment</ThemedText>
            </Pressable>
            <Pressable onPress={onCancel} style={paymentStatusStyles.cancelBtn}>
              <ThemedText style={{ color: colors.icon }}>Cancel</ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

export default function CheckoutScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: companyId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { items, total, currency, itemCount, clearCart } = useCart();
  const { selectedCompany } = useCompany();
  const { useMockData } = useDataSource();
  const { getCachedProducts, adjustStock } = useProductCache();
  const { ask_order_buyer_details: askBuyerDetails, show_requested: showRequested } = useCompanyConfig();

  const [orderNotes, setOrderNotes] = useState('');
  const [buyerStudentName, setBuyerStudentName] = useState('');
  const [buyerStudentClass, setBuyerStudentClass] = useState('');
  const [buyerParentName, setBuyerParentName] = useState('');
  const [buyerParentPhone, setBuyerParentPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  const [showSplitInput, setShowSplitInput] = useState(false);
  const [splitCashInput, setSplitCashInput] = useState('');
  const [splitOnlineInput, setSplitOnlineInput] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusState>(null);
  /** When true, we are navigating to receipt after success; skip empty-cart redirect so receipt screen shows. */
  const navigatingToReceiptRef = useRef(false);
  const razorpayContextRef = useRef<{
    serverOrderId: string;
    razorpayOrderId: string;
    receiptItems: ReturnType<typeof cartToReceiptItems>;
    payment: ReturnType<typeof getOrderPaymentForCheckout>;
    sdkResult?: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
  } | null>(null);

  const userId = session?.user?.id ?? '';
  // Razorpay flow is temporarily disabled — force false regardless of backend config
  const showOnlinePG = false; // selectedCompany?.razorpay_id != null && selectedCompany?.razorpay_id !== '';

  const availableStock = useMemo(() => {
    const products = getCachedProducts(companyId);
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.article_code, getAvailableStock(p));
    }
    return map;
  }, [getCachedProducts, companyId]);

  const hasStockError = useMemo(
    () =>
      items.some((item) => {
        // Refunds and requests do not need stock checks
        if (item.transactionType === 'refund' || item.transactionType === 'request') return false;
        const avail = availableStock.get(item.article_code);
        return avail != null && item.quantity > avail;
      }),
    [items, availableStock],
  );

  const saleRefundItems = useMemo(() => items.filter((i) => i.transactionType !== 'request'), [items]);
  const checkoutRequestItems = useMemo(() => items.filter((i) => i.transactionType === 'request'), [items]);

  /** Buyer block: company flag and/or cart has request lines (details collected once at checkout). */
  const captureBuyerDetails = askBuyerDetails || checkoutRequestItems.length > 0;

  const buyerDetailsIncomplete =
    captureBuyerDetails &&
    (buyerStudentName.trim().length === 0 || buyerStudentClass.trim().length === 0);
  const blockPaymentActions = hasStockError || buyerDetailsIncomplete;

  const buildBuyerDetailsPayload = useCallback((): OrderCheckoutBuyerDetails | undefined => {
    if (!captureBuyerDetails) return undefined;
    return {
      student_name: buyerStudentName.trim() || undefined,
      student_class: buyerStudentClass.trim() || undefined,
      parent_name: buyerParentName.trim() || undefined,
      parent_phone: buyerParentPhone.trim() || undefined,
    };
  }, [captureBuyerDetails, buyerStudentName, buyerStudentClass, buyerParentName, buyerParentPhone]);

  useEffect(() => {
    if (items.length === 0 && !navigatingToReceiptRef.current) {
      router.replace(`/company/${companyId}/create-order` as any);
    }
    if (items.length === 0 && navigatingToReceiptRef.current) {
      navigatingToReceiptRef.current = false;
    }
  }, [items.length, companyId, router]);

  const navigateToReceipt = useCallback(
    (serverOrderId: string, resultTotal: number, payment: ReturnType<typeof getOrderPaymentForCheckout>, receiptItems: ReturnType<typeof cartToReceiptItems>) => {
      navigatingToReceiptRef.current = true;
      clearCart();
      toast.show({ type: 'success', message: Strings.company.orderPlacedSuccess });
      setShowPaymentChoice(false);
      if (Platform.OS === 'web') {
        router.dismissTo(`/company/${companyId}` as any);
      } else {
        const itemsJson = encodeURIComponent(JSON.stringify(receiptItems));
        router.replace({
          pathname: '/company/[id]/receipt-preview',
          params: {
            id: companyId,
            orderId: serverOrderId,
            total: String(resultTotal),
            payment_type: payment.payment_type,
            payment_provider: payment.payment_provider,
            itemsJson,
            currency,
          },
        } as any);
      }
    },
    [clearCart, router, companyId, currency],
  );

  const submitOrder = useCallback(
    async (button: PaymentButtonToShowEnum, splitAmounts?: { cash_share: number; online_share: number }) => {
      if (!companyId || !userId || items.length === 0) {
        if (!userId) toast.show({ type: 'error', message: Strings.company.pleaseSignInToPlaceOrder });
        return;
      }
      if (button === CheckoutButton.SPLIT && !splitAmounts) return;
      setOrderError(null);
      const receiptItems = cartToReceiptItems(items);
      setSubmitting(true);
      const payment = getOrderPaymentForCheckout(button, total, splitAmounts);
      try {
        const requestDetailsForOrder =
          checkoutRequestItems.length > 0
            ? {
                name: buyerStudentName.trim(),
                class: buyerStudentClass.trim(),
                phone: buyerParentPhone.trim() || undefined,
              }
            : undefined;

        const orderInput: CreateOrderInput = {
          company_id: companyId,
          user_id: userId,
          subtotal: total,
          tax_amount: 0,
          total,
          payment_type: payment.payment_type,
          payment_provider: payment.payment_provider,
          cash_share: payment.cash_share,
          online_share: payment.online_share,
          notes: orderNotes.trim() || undefined,
          buyer_details: buildBuyerDetailsPayload(),
          order_items: cartToOrderItems(items, requestDetailsForOrder),
        };
        const result = await createOrder(orderInput, useMockData);
        if (result == null) {
          setOrderError('Order could not be completed. Please try again.');
          return;
        }
        // Optimistically update local stock so the next sale sees correct quantities.
        // Request items do not affect stock — skip them.
        // Server is the source of truth; cache refreshes on next TilesScreen visit.
        adjustStock(
          companyId,
          items
            .filter((i) => i.transactionType !== 'request')
            .map((i) => ({
              article_code: i.article_code,
              quantity_delta: i.transactionType === 'refund' ? i.quantity : -i.quantity,
            })),
        );
        navigateToReceipt(result.server_order_id, result.total, payment, receiptItems);
      } catch (e: any) {
        const msg = e?.detail ?? e?.message ?? Strings.company.somethingWentWrongTryAgain;
        setOrderError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [
      companyId,
      userId,
      items,
      total,
      useMockData,
      navigateToReceipt,
      adjustStock,
      checkoutRequestItems.length,
      buyerStudentName,
      buyerStudentClass,
      buyerParentPhone,
      orderNotes,
      buildBuyerDetailsPayload,
    ],
  );

  const handleCollectPayment = useCallback(() => {
    if (buyerDetailsIncomplete) {
      toast.show({ type: 'info', message: Strings.company.checkoutStudentClassRequiredToast });
      return;
    }
    setShowPaymentChoice(true);
  }, [buyerDetailsIncomplete]);

  const runVerification = useCallback(async (ctx: NonNullable<typeof razorpayContextRef.current>) => {
    if (!ctx.sdkResult) return;
    setPaymentStatus({ phase: 'verifying' });
    try {
      const verification = await verifyRazorpayPayment({
        server_order_id: ctx.serverOrderId,
        razorpay_order_id: ctx.sdkResult.razorpay_order_id,
        razorpay_payment_id: ctx.sdkResult.razorpay_payment_id,
        razorpay_signature: ctx.sdkResult.razorpay_signature,
      });
      if (verification.success) {
        // Optimistically update local stock after verified Razorpay payment.
        // Razorpay flow is always a sale (never a refund), so stock decreases.
        if (companyId) {
          adjustStock(
            companyId,
            ctx.receiptItems.map((i) => ({
              article_code: i.article_code ?? '',
              quantity_delta: -i.quantity,
            })),
          );
        }
        setPaymentStatus({ phase: 'success' });
        setTimeout(() => {
          setPaymentStatus(null);
          navigateToReceipt(ctx.serverOrderId, total, ctx.payment, ctx.receiptItems);
        }, 1500);
      } else {
        setPaymentStatus({
          phase: 'verify_failed',
          message:
            'Payment signature could not be verified by our server. ' +
            'Your money is safe — no extra charge will occur. ' +
            'Please retry or check your orders.',
        });
      }
    } catch {
      setPaymentStatus({
        phase: 'verify_failed',
        message:
          'Unable to reach server for verification. ' +
          'This is likely a network issue — your payment is safe. ' +
          'Please check your connection and retry.',
      });
    }
  }, [total, navigateToReceipt, companyId, adjustStock]);

  const openRazorpaySDK = useCallback(async (razorpayOrderId: string) => {
    const razorpayKey = selectedCompany?.razorpay_id;
    if (!razorpayKey) return;

    setPaymentStatus({ phase: 'processing' });
    try {
      const sdkResult = await openRazorpayCheckout({
        key: razorpayKey,
        order_id: razorpayOrderId,
        amount: Math.round(roundMoney(total) * 100),
        currency: currency === CURRENCY_DEFAULT ? 'INR' : currency,
        name: selectedCompany?.name ?? 'Payment',
        theme: { color: colors.tint },
      });

      const ctx = razorpayContextRef.current;
      if (!ctx) return;

      ctx.sdkResult = sdkResult;
      await runVerification(ctx);
    } catch (err) {
      if (err instanceof RazorpayError && err.code === 2) {
        setPaymentStatus({ phase: 'cancelled' });
      } else {
        const msg = err instanceof RazorpayError
          ? err.description
          : 'Something went wrong during payment. No amount was charged. Please try again.';
        setPaymentStatus({ phase: 'failed', message: msg });
      }
    }
  }, [selectedCompany, total, currency, colors.tint, runVerification]);

  const handleRazorpayPayment = useCallback(async () => {
    if (buyerDetailsIncomplete) {
      toast.show({ type: 'info', message: Strings.company.checkoutStudentClassRequiredToast });
      return;
    }
    if (!companyId || !userId || items.length === 0) {
      if (!userId) toast.show({ type: 'error', message: Strings.company.pleaseSignInToPlaceOrder });
      return;
    }
    const razorpayKey = selectedCompany?.razorpay_id;
    if (!razorpayKey) {
      toast.show({ type: 'error', message: 'Razorpay is not configured for this company.' });
      return;
    }

    setShowPaymentChoice(false);
    setOrderError(null);
    setSubmitting(true);

    const receiptItems = cartToReceiptItems(items);
    const payment = getOrderPaymentForCheckout(CheckoutButton.RAZORPAY, total);

    try {
      const requestDetailsForOrder =
        checkoutRequestItems.length > 0
          ? {
              name: buyerStudentName.trim(),
              class: buyerStudentClass.trim(),
              phone: buyerParentPhone.trim() || undefined,
            }
          : undefined;

      const orderInput: CreateOrderInput = {
        company_id: companyId,
        user_id: userId,
        subtotal: total,
        tax_amount: 0,
        total,
        payment_type: payment.payment_type,
        payment_provider: payment.payment_provider,
        cash_share: payment.cash_share,
        online_share: payment.online_share,
        status: OrderStatus.PENDING,
        notes: orderNotes.trim() || undefined,
        buyer_details: buildBuyerDetailsPayload(),
        order_items: cartToOrderItems(items, requestDetailsForOrder),
      };
      const result = await createOrder(orderInput, useMockData);
      if (!result) {
        setOrderError('Could not create order on our server. No payment was charged. Please try again.');
        setSubmitting(false);
        return;
      }
      const serverOrderId = result.server_order_id;

      let rzOrderResult;
      try {
        rzOrderResult = await createRazorpayOrder({
          server_order_id: serverOrderId,
          amount: total,
          currency: currency === CURRENCY_DEFAULT ? 'INR' : currency,
        });
      } catch (rzErr: any) {
        const rzMsg =
          rzErr?.detail ?? rzErr?.message ?? 'Could not initiate payment with Razorpay.';
        setOrderError(
          `${rzMsg} No payment was charged. Please check your connection and try again.`,
        );
        try {
          await updateOrderStatus({ server_order_id: serverOrderId, status: OrderStatus.FAILED });
        } catch { /* best effort cleanup */ }
        setSubmitting(false);
        return;
      }

      razorpayContextRef.current = {
        serverOrderId,
        razorpayOrderId: rzOrderResult.razorpay_order_id,
        receiptItems,
        payment,
      };

      setSubmitting(false);
      await openRazorpaySDK(rzOrderResult.razorpay_order_id);
    } catch (e: any) {
      const msg = e?.detail ?? e?.message ?? Strings.company.somethingWentWrongTryAgain;
      setOrderError(msg);
      setSubmitting(false);
    }
  }, [
    buyerDetailsIncomplete,
    companyId,
    userId,
    items,
    total,
    currency,
    selectedCompany,
    useMockData,
    openRazorpaySDK,
    checkoutRequestItems.length,
    buyerStudentName,
    buyerStudentClass,
    buyerParentPhone,
    orderNotes,
    buildBuyerDetailsPayload,
  ]);

  const handleRazorpayRetry = useCallback(() => {
    const ctx = razorpayContextRef.current;
    if (!ctx) {
      setPaymentStatus(null);
      return;
    }
    openRazorpaySDK(ctx.razorpayOrderId);
  }, [openRazorpaySDK]);

  const handleRetryVerify = useCallback(() => {
    const ctx = razorpayContextRef.current;
    if (!ctx?.sdkResult) {
      setPaymentStatus(null);
      return;
    }
    runVerification(ctx);
  }, [runVerification]);

  const handleRazorpayCancel = useCallback(async () => {
    const ctx = razorpayContextRef.current;
    const wasVerifyFailed = paymentStatus?.phase === 'verify_failed';

    if (ctx && !wasVerifyFailed) {
      try {
        await updateOrderStatus({ server_order_id: ctx.serverOrderId, status: OrderStatus.FAILED });
      } catch { /* best effort */ }
    }

    razorpayContextRef.current = null;
    setPaymentStatus(null);

    if (wasVerifyFailed) {
      router.push(`/company/${companyId}/orders` as any);
    }
  }, [paymentStatus, router, companyId]);

  const handlePaymentChoice = useCallback(
    (button: PaymentButtonToShowEnum) => {
      if (button === CheckoutButton.SPLIT) {
        setShowSplitInput(true);
        setSplitCashInput('');
        setSplitOnlineInput('');
        return;
      }
      if (button === CheckoutButton.RAZORPAY) {
        handleRazorpayPayment();
        return;
      }
      setShowPaymentChoice(false);
      submitOrder(button);
    },
    [submitOrder, handleRazorpayPayment]
  );

  const handleSplitBack = useCallback(() => {
    setShowSplitInput(false);
    setSplitCashInput('');
    setSplitOnlineInput('');
  }, []);

  const handleSplitCashChange = useCallback((text: string) => {
    setSplitCashInput(text);
    const cash = parseFloat(text || '0') || 0;
    if (cash >= 0 && cash <= total) {
      setSplitOnlineInput(formatAmount(roundMoney(total - cash)));
    }
  }, [total]);

  const handleSplitConfirm = useCallback(() => {
    if (buyerDetailsIncomplete) {
      toast.show({ type: 'info', message: Strings.company.checkoutStudentClassRequiredToast });
      return;
    }
    const cash_share = roundMoney(parseFloat(splitCashInput || '0') || 0);
    const online_share = roundMoney(parseFloat(splitOnlineInput || '0') || 0);
    const sum = roundMoney(cash_share + online_share);
    if (sum !== roundMoney(total)) {
      toast.show({
        type: 'error',
        message: `Cash + Online must equal total (${formatPrice(total, currency)}).`,
      });
      return;
    }
    setShowSplitInput(false);
    setShowPaymentChoice(false);
    setSplitCashInput('');
    setSplitOnlineInput('');
    submitOrder(CheckoutButton.SPLIT, { cash_share, online_share });
  }, [splitCashInput, splitOnlineInput, total, currency, submitOrder, buyerDetailsIncomplete]);

  /** Razorpay PG from bottom bar shortcut. */
  const handleRazorpayPG = useCallback(() => {
    handleRazorpayPayment();
  }, [handleRazorpayPayment]);

  /** For negative totals (refunds): complete with Cash (no payment choice popup). */
  const handleCompleteOrder = useCallback(() => {
    if (buyerDetailsIncomplete) {
      toast.show({ type: 'info', message: Strings.company.checkoutStudentClassRequiredToast });
      return;
    }
    submitOrder(CheckoutButton.CASH);
  }, [submitOrder, buyerDetailsIncomplete]);

  const isRefund = total <= 0;
  const shouldCollectPayment = total > 0;

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
          {saleRefundItems.map((item) => {
            const isItemRefund = item.transactionType === 'refund';
            const lineTotal = roundMoney(item.unit_price * item.quantity * (isItemRefund ? -1 : 1));
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

          {showRequested && checkoutRequestItems.length > 0 ? (
            <>
              <View style={styles.checkoutSectionSeparator}>
                <View style={[styles.checkoutSectionLine, { backgroundColor: CHECKOUT_REQUEST_PURPLE + '40' }]} />
                <View style={[styles.checkoutSectionLabelWrap, { backgroundColor: '#EDE7F6' }]}>
                  <ThemedText style={[styles.checkoutSectionLabel, { color: CHECKOUT_REQUEST_PURPLE }]}>
                    Requested Items
                  </ThemedText>
                </View>
                <View style={[styles.checkoutSectionLine, { backgroundColor: CHECKOUT_REQUEST_PURPLE + '40' }]} />
              </View>
              {checkoutRequestItems.map((item) => {
                const lineTotal = roundMoney(item.unit_price * item.quantity);
                return (
                  <CheckoutItemCell
                    key={`${item.article_code}-${item.transactionType}`}
                    item={item}
                    lineTotal={lineTotal}
                    colors={colors}
                    isRefund={false}
                    isRequest
                  />
                );
              })}
            </>
          ) : null}
        </View>

        {captureBuyerDetails ? (
          <View style={styles.checkoutFormBlock}>
            <ThemedText type="defaultSemiBold" style={{ color: colors.text, marginBottom: 8 }}>
              {Strings.company.checkoutBuyerDetailsTitle}
            </ThemedText>
            <TextInput
              style={[styles.buyerFieldInput, { borderColor: colors.icon + '40', color: colors.text, backgroundColor: colors.background }]}
              placeholder={Strings.company.checkoutBuyerStudentName}
              placeholderTextColor={colors.icon}
              value={buyerStudentName}
              onChangeText={setBuyerStudentName}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.buyerFieldInput, { borderColor: colors.icon + '40', color: colors.text, backgroundColor: colors.background }]}
              placeholder={Strings.company.checkoutBuyerStudentClass}
              placeholderTextColor={colors.icon}
              value={buyerStudentClass}
              onChangeText={setBuyerStudentClass}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.buyerFieldInput, { borderColor: colors.icon + '40', color: colors.text, backgroundColor: colors.background }]}
              placeholder={Strings.company.checkoutBuyerParentName}
              placeholderTextColor={colors.icon}
              value={buyerParentName}
              onChangeText={setBuyerParentName}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.buyerFieldInput, { borderColor: colors.icon + '40', color: colors.text, backgroundColor: colors.background }]}
              placeholder={Strings.company.checkoutBuyerParentPhone}
              placeholderTextColor={colors.icon}
              value={buyerParentPhone}
              onChangeText={setBuyerParentPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </View>
        ) : null}

        <View style={styles.checkoutFormBlock}>
          <ThemedText style={[styles.formLabel, { color: colors.text }]}>
            {Strings.company.checkoutOrderNotesLabel}
          </ThemedText>
          <TextInput
            style={[
              styles.notesInput,
              {
                borderColor: colors.icon + '40',
                color: colors.text,
                backgroundColor: colors.background,
              },
            ]}
            placeholder={Strings.company.checkoutOrderNotesPlaceholder}
            placeholderTextColor={colors.icon}
            value={orderNotes}
            onChangeText={setOrderNotes}
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      {/* ---- Fixed bottom bar ---- */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.background, borderTopColor: colors.icon + '20', paddingBottom: 16 + insets.bottom },
        ]}
      >
        <View style={styles.bottomSummarySingleRow}>
          <ThemedText style={[styles.bottomSummaryLeft, { color: colors.text }]} numberOfLines={1}>
            {Strings.company.checkoutTotalItemsEquals} {itemCount}
          </ThemedText>
          <ThemedText
            style={[
              styles.bottomSummaryRight,
              { color: colors.text },
              total < 0 && { color: '#C62828' },
            ]}
            numberOfLines={2}
          >
            {Strings.company.checkoutTotalAmountEquals}{' '}
            {total < 0 ? '- ' : ''}
            {formatPrice(Math.abs(total), currency)}
          </ThemedText>
        </View>

        {buyerDetailsIncomplete && (
          <ThemedText style={styles.stockWarning}>
            {Strings.company.checkoutStudentClassRequiredToast}
          </ThemedText>
        )}

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
          {!shouldCollectPayment ? (
            <Pressable
              onPress={handleCompleteOrder}
              disabled={submitting || blockPaymentActions}
              style={[
                styles.optionBtn,
                {
                  backgroundColor: blockPaymentActions ? colors.icon + '40' : colors.tint,
                  borderColor: blockPaymentActions ? colors.icon + '40' : colors.tint,
                },
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
                disabled={submitting || blockPaymentActions}
                style={[
                  styles.optionBtn,
                  {
                    backgroundColor: blockPaymentActions ? colors.icon + '40' : colors.tint,
                    borderColor: blockPaymentActions ? colors.icon + '40' : colors.tint,
                  },
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
                  onPress={handleRazorpayPG}
                  disabled={submitting || blockPaymentActions}
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
        onRequestClose={() => {
          if (!submitting) {
            setShowSplitInput(false);
            setShowPaymentChoice(false);
          }
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!showSplitInput && !submitting) setShowPaymentChoice(false);
          }}
        >
          <View
            style={[styles.choiceModal, { backgroundColor: colors.background }]}
            onStartShouldSetResponder={() => true}
          >
            {showSplitInput ? (
              <>
                <ThemedText type="subtitle" style={styles.choiceModalTitle}>
                  Split payment
                </ThemedText>
                <ThemedText style={[styles.choiceModalHint, { color: colors.icon }]}>
                  Total: {formatPrice(total, currency)} — enter cash and online amounts
                </ThemedText>
                <TextInput
                  style={[styles.splitInput, { backgroundColor: colors.background, borderColor: colors.icon + '40', color: colors.text }]}
                  placeholder="Cash amount (₹)"
                  placeholderTextColor={colors.icon}
                  value={splitCashInput}
                  onChangeText={handleSplitCashChange}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.splitInput, { backgroundColor: colors.background, borderColor: colors.icon + '40', color: colors.text }]}
                  placeholder="Online amount (₹)"
                  placeholderTextColor={colors.icon}
                  value={splitOnlineInput}
                  onChangeText={setSplitOnlineInput}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  onPress={handleSplitConfirm}
                  disabled={submitting}
                  style={[styles.choiceBtn, { backgroundColor: colors.tint }]}
                >
                  <ThemedText style={styles.choiceBtnTextPrimary}>Confirm Payment</ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleSplitBack}
                  style={[styles.choiceCancel, { borderColor: colors.icon + '40' }]}
                >
                  <ThemedText style={{ color: colors.icon }}>Back</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <ThemedText type="subtitle" style={styles.choiceModalTitle}>
                  {Strings.company.collectPayment}
                </ThemedText>
                <ThemedText style={[styles.choiceModalHint, { color: colors.icon }]}>
                  {Strings.company.choosePaymentMethod}
                </ThemedText>
                <Pressable
                  onPress={() => handlePaymentChoice(CheckoutButton.CASH)}
                  style={[styles.choiceBtnFilled, { backgroundColor: colors.tint }]}
                >
                  <IconSymbol name="banknote" size={22} color="#fff" />
                  <ThemedText style={styles.choiceBtnTextWhite}>{Strings.company.cash}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => handlePaymentChoice(CheckoutButton.ONLINE)}
                  style={[styles.choiceBtnFilled, { backgroundColor: PAYMENT_COLORS.online }]}
                >
                  <ThemedText style={styles.choiceBtnTextWhite}>{Strings.company.online}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => handlePaymentChoice(CheckoutButton.SPLIT)}
                  style={[styles.choiceBtnFilled, { backgroundColor: PAYMENT_COLORS.split }]}
                >
                  <View style={styles.choiceBtnContent}>
                    <ThemedText style={styles.choiceBtnTextWhite}>{CheckoutButton.SPLIT}</ThemedText>
                    <ThemedText style={styles.choiceBtnSubtext}>(cash + UPI)</ThemedText>
                  </View>
                </Pressable>
                {showOnlinePG && (
                  <Pressable
                    onPress={() => handlePaymentChoice(CheckoutButton.RAZORPAY)}
                    style={[styles.choiceBtnFilled, { backgroundColor: PAYMENT_COLORS.razorpay }]}
                  >
                    <ThemedText style={styles.choiceBtnTextWhite}>{Strings.company.onlinePg}</ThemedText>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setShowPaymentChoice(false)}
                  style={[styles.choiceCancel, { borderColor: colors.icon + '40' }]}
                >
                  <ThemedText style={{ color: colors.icon }}>{Strings.common.cancel}</ThemedText>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <PaymentStatusOverlay
        status={paymentStatus}
        onRetry={handleRazorpayRetry}
        onRetryVerify={handleRetryVerify}
        onCancel={handleRazorpayCancel}
        colors={colors}
      />
    </ThemedView>
  );
}

const paymentStatusStyles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  card: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    marginTop: 4,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 8,
  },
});

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
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  title: { marginTop: 12 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  checkoutFormBlock: { marginBottom: 18, gap: 8 },
  formLabel: { fontSize: 14, fontWeight: '600' },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    minHeight: 88,
  },
  buyerFieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  /* ---- Item cards (checkout: name + article code, right: qty × price = subtotal) ---- */
  itemsSection: { gap: 10, marginBottom: 16 },
  itemCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  checkoutItemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  checkoutItemLeft: { flex: 1, minWidth: 0, gap: 2 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemName: { flex: 1 },
  checkoutSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  checkoutArticleCode: { fontSize: 12 },
  checkoutBadgeRow: { marginTop: 6, alignSelf: 'flex-start' },
  checkoutFormulaRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', flexShrink: 0 },
  checkoutFormula: { fontSize: 13 },
  checkoutFormulaPrefix: { fontWeight: '400', textAlign: 'right' },
  refundBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  refundBadgeText: { fontSize: 11, fontWeight: '600', color: '#C62828' },
  stockError: { color: '#C62828', fontSize: 12, marginTop: 6 },
  checkoutSectionSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, gap: 8 },
  checkoutSectionLine: { flex: 1, height: 1 },
  checkoutSectionLabelWrap: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  checkoutSectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  /* ---- Bottom bar ---- */
  bottomBar: { borderTopWidth: 1, paddingHorizontal: 24, paddingTop: 12 },
  bottomSummarySingleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
    gap: 12,
  },
  bottomSummaryLeft: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  bottomSummaryRight: {
    flexShrink: 0,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'right',
    marginLeft: 12,
  },
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
  splitInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
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
  choiceBtnFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  choiceBtnTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  choiceBtnTextWhite: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  choiceBtnContent: {
    alignItems: 'center',
    gap: 2,
  },
  choiceBtnSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
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
