import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { fetchOrders } from '@/core/api/orders';
import { formatDate, formatPrice, truncateId } from '@/core/services/format';
import type { OrderStatusEnum, OrderWithItems } from '@/core/types/order';
import { getPaymentDisplayKey, fromPaymentMethodValue, PaymentType } from '@/core/types/order';
import { Strings } from '@/core/strings';

type FilterValue = OrderStatusEnum | 'all' | 'refund';

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: Strings.company.all, value: 'all' },
  { label: Strings.company.success, value: 'success' },
  { label: Strings.company.failed, value: 'failed' },
  { label: Strings.company.pending, value: 'pending' },
  { label: Strings.company.refund, value: 'refund' },
];

const STATUS_STYLE: Record<
  OrderStatusEnum,
  { bg: string; fg: string; icon: Parameters<typeof IconSymbol>[0]['name'] }
> = {
  success: { bg: '#E8F5E9', fg: '#2E7D32', icon: 'checkmark.circle.fill' },
  failed: { bg: '#FFEBEE', fg: '#C62828', icon: 'xmark.circle.fill' },
  pending: { bg: '#FFF3E0', fg: '#E65100', icon: 'clock.fill' },
};

const ORDER_ID_DISPLAY_LEN = 16;

function paymentLabelForOrder(order: { payment_type: OrderWithItems['payment_type']; payment_provider: OrderWithItems['payment_provider'] }): string {
  const key = getPaymentDisplayKey(order);
  return Strings.company[key];
}

export default function OrdersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();

  const [filter, setFilter] = useState<FilterValue>('all');
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchOrders(id, { status: 'all' }, useMockData)
      .then((data) => { if (mountedRef.current) setOrders(data); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [id, useMockData]);

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'refund') return orders.filter((o) => o.total < 0);
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const totalSales = useMemo(() => {
    const successful = orders.filter(
      (o) => o.status === 'success' && o.total > 0,
    );
    return successful.reduce((sum, o) => sum + o.total, 0);
  }, [orders]);

  const currency = orders[0]?.currency ?? CURRENCY_DEFAULT;

  const renderOrder = useCallback(
    ({ item }: { item: OrderWithItems }) => {
      const s = STATUS_STYLE[item.status];
      const isRefund = item.total < 0;
      return (
        <Pressable
          onPress={() => setSelectedOrder(item)}
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}
        >
          <View style={styles.cardTop}>
            <ThemedText style={[styles.orderId, { color: colors.icon }]}>
              #{truncateId(item.server_order_id ?? '', ORDER_ID_DISPLAY_LEN)}
            </ThemedText>
            <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
              <IconSymbol name={s.icon} size={14} color={s.fg} />
              <ThemedText style={[styles.statusText, { color: s.fg }]}>
                {item.status}
              </ThemedText>
            </View>
          </View>
          <View style={styles.cardBottom}>
            <View style={styles.cardBottomLeft}>
              <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
                {formatDate(item.created_at)} ·{' '}
              </ThemedText>
              <ThemedText style={[styles.paymentMethodBold, { color: colors.icon }]}>
                {paymentLabelForOrder(item)}
              </ThemedText>
            </View>
            <ThemedText
              type="defaultSemiBold"
              style={isRefund ? { color: '#C62828' } : undefined}
            >
              {isRefund ? '- ' : ''}{formatPrice(isRefund ? -item.total : item.total, item.currency)}
            </ThemedText>
          </View>
        </Pressable>
      );
    },
    [colors],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: Strings.company.orders }} />

      <View style={[styles.totalCard, { backgroundColor: colors.tint + '10', borderColor: colors.tint + '30' }]}>
        <ThemedText style={[styles.totalLabel, { color: colors.tint }]}>{Strings.company.totalOrders}</ThemedText>
        <ThemedText type="title" style={[styles.totalValue, { color: colors.tint }]}>
          {formatPrice(totalSales, currency)}
        </ThemedText>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: colors.tint }
                  : { backgroundColor: colors.icon + '12' },
              ]}
            >
              <ThemedText
                style={[styles.chipText, active ? { color: '#fff' } : { color: colors.text }]}
              >
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>{Strings.company.noOrdersFound}</ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.server_order_id ?? ''}
          renderItem={renderOrder}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={selectedOrder != null}
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <ThemedView style={[styles.modalRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '25' }]}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {Strings.company.orderDetails}
            </ThemedText>
            <Pressable onPress={() => setSelectedOrder(null)} hitSlop={12} style={styles.modalCloseBtn}>
              <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>{Strings.common.done}</ThemedText>
            </Pressable>
          </View>
          {selectedOrder && (
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                #{selectedOrder.server_order_id ?? '—'}
              </ThemedText>
              <ThemedText style={[styles.detailRow, { color: colors.text }]}>
                {formatDate(selectedOrder.created_at)}
              </ThemedText>
              <View style={styles.detailRow}>
                <ThemedText style={{ color: colors.icon }}>Status: </ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_STYLE[selectedOrder.status].bg }]}>
                  <IconSymbol name={STATUS_STYLE[selectedOrder.status].icon} size={12} color={STATUS_STYLE[selectedOrder.status].fg} />
                  <ThemedText style={[styles.statusText, { color: STATUS_STYLE[selectedOrder.status].fg }]}>
                    {selectedOrder.status}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.detailRow, { color: colors.text }]}>
                <ThemedText style={{ color: colors.icon }}>Payment: </ThemedText>
                <ThemedText style={{ fontWeight: '600' }}>{paymentLabelForOrder(selectedOrder)}</ThemedText>
              </ThemedText>
              {selectedOrder.payment_type === PaymentType.SPLIT && (
                <View style={styles.splitShareRow}>
                  <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
                    Cash: {formatPrice(selectedOrder.cash_share, selectedOrder.currency)}
                  </ThemedText>
                  <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
                    Online: {formatPrice(selectedOrder.online_share, selectedOrder.currency)}
                  </ThemedText>
                </View>
              )}
              <View style={[styles.detailDivider, { backgroundColor: colors.icon + '20' }]} />
              {(selectedOrder.items ?? []).map((line, idx) => (
                <View key={idx} style={[styles.detailItemRow, { borderBottomColor: colors.icon + '15' }]}>
                  <ThemedText style={{ color: colors.text, flex: 1 }} numberOfLines={2}>
                    {line.product_name}
                    {line.size ? ` (${line.size})` : ''}
                  </ThemedText>
                  <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
                    {line.quantity} × {formatPrice(line.unit_price, selectedOrder.currency)} = {formatPrice(line.total, selectedOrder.currency)}
                  </ThemedText>
                </View>
              ))}
              <View style={[styles.detailDivider, { backgroundColor: colors.icon + '20' }]} />
              <View style={styles.detailTotalRow}>
                <ThemedText type="defaultSemiBold">{Strings.company.total}</ThemedText>
                <ThemedText
                  type="defaultSemiBold"
                  style={selectedOrder.total < 0 ? { color: '#C62828' } : undefined}
                >
                  {selectedOrder.total < 0 ? '- ' : ''}{formatPrice(selectedOrder.total < 0 ? -selectedOrder.total : selectedOrder.total, selectedOrder.currency)}
                </ThemedText>
              </View>
            </ScrollView>
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  totalCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 28, marginTop: 4 },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  separator: { height: 10 },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  orderId: { fontSize: 13, fontWeight: '500' },
  paymentMethodBold: { fontSize: 13, fontWeight: '600' },
  cardBottomLeft: { flexDirection: 'row', alignItems: 'center' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { flex: 1 },
  modalCloseBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16, paddingBottom: 24 },
  detailRow: { marginBottom: 8, fontSize: 14 },
  detailDivider: { height: 1, marginVertical: 12 },
  detailItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  splitShareRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
});
