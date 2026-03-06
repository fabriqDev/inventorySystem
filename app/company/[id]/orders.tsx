import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useDataSource } from '@/contexts/data-source-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchOrders } from '@/lib/api/orders';
import { formatDate, formatPrice, truncateId } from '@/lib/format';
import type { OrderStatus, OrderWithItems } from '@/types/order';

type FilterValue = OrderStatus | 'all';

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Pending', value: 'pending' },
];

const STATUS_STYLE: Record<
  OrderStatus,
  { bg: string; fg: string; icon: Parameters<typeof IconSymbol>[0]['name'] }
> = {
  success: { bg: '#E8F5E9', fg: '#2E7D32', icon: 'checkmark.circle.fill' },
  failed: { bg: '#FFEBEE', fg: '#C62828', icon: 'xmark.circle.fill' },
  pending: { bg: '#FFF3E0', fg: '#E65100', icon: 'clock.fill' },
};

export default function OrdersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();

  const [filter, setFilter] = useState<FilterValue>('all');
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchOrders(id, { status: filter }, useMockData)
      .then((data) => { if (mountedRef.current) setOrders(data); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [id, filter, useMockData]);

  const totalSales = useMemo(() => {
    const successful = orders.filter(
      (o) => o.status === 'success' && o.transaction_type === 'sale',
    );
    return successful.reduce((sum, o) => sum + o.total, 0);
  }, [orders]);

  const currency = orders[0]?.currency ?? '₹';

  const renderOrder = useCallback(
    ({ item }: { item: OrderWithItems }) => {
      const s = STATUS_STYLE[item.status];
      return (
        <View
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}
        >
          <View style={styles.cardTop}>
            <ThemedText style={[styles.orderId, { color: colors.icon }]}>
              #{truncateId(item.order_id)}
            </ThemedText>
            <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
              <IconSymbol name={s.icon} size={14} color={s.fg} />
              <ThemedText style={[styles.statusText, { color: s.fg }]}>
                {item.status}
              </ThemedText>
            </View>
          </View>
          <View style={styles.cardBottom}>
            <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
              {formatDate(item.created_at)} · {item.payment_method}
              {item.transaction_type === 'refund' ? ' · Refund' : ''}
            </ThemedText>
            <ThemedText type="defaultSemiBold">
              {formatPrice(item.transaction_type === 'refund' ? -item.total : item.total, item.currency)}
            </ThemedText>
          </View>
        </View>
      );
    },
    [colors],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Orders' }} />

      {/* Total sales header */}
      <View style={[styles.totalCard, { backgroundColor: colors.tint + '10', borderColor: colors.tint + '30' }]}>
        <ThemedText style={[styles.totalLabel, { color: colors.tint }]}>Total Orders</ThemedText>
        <ThemedText type="title" style={[styles.totalValue, { color: colors.tint }]}>
          {formatPrice(totalSales, currency)}
        </ThemedText>
      </View>

      {/* Filter chips */}
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
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>No orders found</ThemedText>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          renderItem={renderOrder}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  },
  orderId: { fontSize: 13, fontWeight: '500' },
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
});
