import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
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
import { fetchOrderItems, fetchOrders } from '@/core/api/orders';
import type { FetchOrdersOptions } from '@/core/api/orders';
import { formatDate, formatPrice, roundMoney } from '@/core/services/format';
import type { OrderItem, OrderStats, OrderStatusEnum, OrderWithItems } from '@/core/types/order';
import { getPaymentDisplayKey, PaymentType } from '@/core/types/order';
import { Strings } from '@/core/strings';

// ── Types ────────────────────────────────────────────────────────────────────

type FilterValue = OrderStatusEnum | 'all' | 'refund' | 'cash' | 'online';

type DatePreset = 'today' | '3days' | 'custom';

interface DateFilter {
  preset: DatePreset | null;
  from: string;
  to: string;
}

interface OrderSection {
  title: string;
  data: OrderWithItems[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 50;

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: Strings.company.all, value: 'all' },
  { label: Strings.company.success, value: 'success' },
  { label: Strings.company.failed, value: 'failed' },
  { label: Strings.company.pending, value: 'pending' },
  { label: Strings.company.refundTab, value: 'refund' },
];

const STATUS_STYLE: Record<
  OrderStatusEnum,
  { bg: string; fg: string; icon: Parameters<typeof IconSymbol>[0]['name'] }
> = {
  success: { bg: '#E8F5E9', fg: '#2E7D32', icon: 'checkmark.circle.fill' },
  failed: { bg: '#FFEBEE', fg: '#C62828', icon: 'xmark.circle.fill' },
  pending: { bg: '#FFF3E0', fg: '#E65100', icon: 'clock.fill' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function paymentLabelForOrder(order: Pick<OrderWithItems, 'payment_type' | 'payment_provider'>): string {
  const key = getPaymentDisplayKey(order);
  return Strings.company[key];
}

function toDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return Strings.company.today;
  if (sameDay(date, yesterday)) return Strings.company.yesterday;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function groupByDate(orders: OrderWithItems[]): OrderSection[] {
  const map = new Map<string, OrderWithItems[]>();
  for (const order of orders) {
    const label = toDateLabel(order.created_at);
    const bucket = map.get(label) ?? [];
    bucket.push(order);
    map.set(label, bucket);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateInput(str: string): Date | null {
  // Accept DD MMM YYYY or YYYY-MM-DD
  const parts = str.trim().split(/[\s/-]/);
  if (parts.length === 3) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();

  // Filter tabs
  const [filter, setFilter] = useState<FilterValue>('all');

  // Date filter modal
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>({ preset: null, from: '', to: '' });
  const [draftPreset, setDraftPreset] = useState<DatePreset | null>(null);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');

  // Orders data
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [stats, setStats] = useState<OrderStats>({ totalRevenue: 0, totalRefunds: 0, cashTotal: 0, onlineTotal: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Order detail modal
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const itemCacheRef = useRef<Record<string, OrderItem[]>>({});

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Manual refresh ────────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    itemCacheRef.current = {};
    setRefreshKey((k) => k + 1);
  }, []);

  // ── Build fetch options ───────────────────────────────────────────────────

  const buildFetchOptions = useCallback((pg: number): FetchOrdersOptions => {
    const opts: FetchOrdersOptions = { page: pg, limit: PAGE_LIMIT };
    if (dateFilter.preset === 'today') {
      const now = new Date();
      opts.dateFrom = startOfDay(now).toISOString();
      opts.dateTo = endOfDay(now).toISOString();
    } else if (dateFilter.preset === '3days') {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 2);
      opts.dateFrom = startOfDay(from).toISOString();
      opts.dateTo = endOfDay(now).toISOString();
    } else if (dateFilter.preset === 'custom') {
      const from = parseDateInput(dateFilter.from);
      const to = parseDateInput(dateFilter.to);
      if (from) opts.dateFrom = startOfDay(from).toISOString();
      if (to) opts.dateTo = endOfDay(to).toISOString();
    }
    return opts;
  }, [dateFilter]);

  // ── Fetch page 1 ─────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setOrders([]);
    setPage(1);
    const opts = buildFetchOptions(1);
    fetchOrders(id, opts, useMockData)
      .then((res) => {
        if (!mountedRef.current) return;
        setOrders(res.orders);
        setTotalCount(res.totalCount);
        setStats(res.stats);
        setHasMore(res.orders.length < res.totalCount);
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [id, useMockData, dateFilter, buildFetchOptions, refreshKey]);

  // ── Load more (infinite scroll) ──────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    const opts = buildFetchOptions(nextPage);
    fetchOrders(id, opts, useMockData)
      .then((res) => {
        if (!mountedRef.current) return;
        setOrders((prev) => [...prev, ...res.orders]);
        setPage(nextPage);
        setHasMore(orders.length + res.orders.length < res.totalCount);
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoadingMore(false); });
  }, [id, useMockData, loadingMore, hasMore, page, orders.length, buildFetchOptions]);

  // ── Filter orders client-side ─────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'refund') return orders.filter((o) => o.refund_amount > 0);
    if (filter === 'cash') return orders.filter((o) => o.payment_type === PaymentType.CASH);
    if (filter === 'online') return orders.filter(
      (o) => o.payment_type === PaymentType.ONLINE || o.payment_type === PaymentType.SPLIT
    );
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  // ── Section data ──────────────────────────────────────────────────────────

  const sections = useMemo(() => groupByDate(filteredOrders), [filteredOrders]);

  // ── Active stats for current filter ──────────────────────────────────────

  // Header always shows total sales — consistent across all filter tabs
  const primaryStat = useMemo(() => ({
    label: Strings.company.totalSales,
    value: stats.totalRevenue,
  }), [stats.totalRevenue]);

  const currency = orders[0]?.currency ?? CURRENCY_DEFAULT;

  // ── Open order detail (lazy-load items) ──────────────────────────────────

  const handleOpenOrder = useCallback(async (order: OrderWithItems) => {
    setSelectedOrder(order);
    const orderId = order.server_order_id ?? '';
    if (!orderId) return;
    if (itemCacheRef.current[orderId]) {
      setSelectedOrder((prev) => prev ? { ...prev, items: itemCacheRef.current[orderId] } : prev);
      return;
    }
    setLoadingItems(true);
    try {
      const items = await fetchOrderItems(orderId, useMockData);
      itemCacheRef.current[orderId] = items;
      if (mountedRef.current) {
        setSelectedOrder((prev) => prev?.server_order_id === orderId ? { ...prev, items } : prev);
      }
    } catch {
      // leave items empty, user can close and retry
    } finally {
      if (mountedRef.current) setLoadingItems(false);
    }
  }, [useMockData]);

  // ── Date filter modal logic ───────────────────────────────────────────────

  const openDateFilter = useCallback(() => {
    setDraftPreset(dateFilter.preset);
    setDraftFrom(dateFilter.from);
    setDraftTo(dateFilter.to);
    setShowDateFilter(true);
  }, [dateFilter]);

  const applyDateFilter = useCallback(() => {
    setDateFilter({ preset: draftPreset, from: draftFrom, to: draftTo });
    setShowDateFilter(false);
  }, [draftPreset, draftFrom, draftTo]);

  const clearDateFilter = useCallback(() => {
    setDateFilter({ preset: null, from: '', to: '' });
    setShowDateFilter(false);
  }, []);

  const hasActiveDateFilter = dateFilter.preset !== null;

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderOrder = useCallback(
    ({ item }: { item: OrderWithItems }) => {
      const s = STATUS_STYLE[item.status];
      const showRefundAmount = filter === 'refund' && item.refund_amount > 0;
      const isNegative = item.total < 0;
      return (
        <Pressable
          onPress={() => handleOpenOrder(item)}
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}
        >
          <View style={styles.cardTop}>
            <ThemedText style={[styles.orderId, { color: colors.icon }]}>
              #{item.server_order_id ?? '—'}
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
            {showRefundAmount ? (
              <ThemedText type="defaultSemiBold" style={{ color: '#C62828' }}>
                - {formatPrice(item.refund_amount, item.currency)}
              </ThemedText>
            ) : (
              <ThemedText
                type="defaultSemiBold"
                style={isNegative ? { color: '#C62828' } : undefined}
              >
                {isNegative ? '- ' : ''}{formatPrice(isNegative ? -item.total : item.total, item.currency)}
              </ThemedText>
            )}
          </View>
        </Pressable>
      );
    },
    [colors, handleOpenOrder, filter],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: OrderSection }) => (
      <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
        <View style={[styles.sectionHeaderPill, { backgroundColor: colors.icon + '18' }]}>
          <ThemedText style={[styles.sectionHeaderText, { color: colors.icon }]}>
            {section.title}
          </ThemedText>
        </View>
      </View>
    ),
    [colors],
  );

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadMoreFooter}>
        <ActivityIndicator size="small" color={colors.tint} />
        <ThemedText style={{ color: colors.icon, fontSize: 13 }}>{Strings.company.loadingMore}</ThemedText>
      </View>
    );
  }, [loadingMore, colors]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: Strings.company.orders,
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <Pressable onPress={handleRefresh} hitSlop={10} style={styles.headerIconBtn}>
                <IconSymbol name="arrow.clockwise" size={22} color={colors.icon} />
              </Pressable>
              <Pressable onPress={openDateFilter} hitSlop={10} style={styles.filterIconBtn}>
                <IconSymbol
                  name="line.3.horizontal.decrease.circle"
                  size={24}
                  color={hasActiveDateFilter ? colors.tint : colors.icon}
                />
                {hasActiveDateFilter && (
                  <View style={[styles.filterActiveDot, { backgroundColor: colors.tint }]} />
                )}
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Summary card */}
      <View style={[styles.totalCard, { backgroundColor: colors.tint + '10', borderColor: colors.tint + '30' }]}>
        <ThemedText style={[styles.totalLabel, { color: colors.tint }]}>{primaryStat.label}</ThemedText>
        <ThemedText type="title" style={[styles.totalValue, { color: colors.tint }]}>
          {formatPrice(roundMoney(primaryStat.value), currency)}
        </ThemedText>
        <View style={[styles.statsRow, { borderTopColor: colors.icon + '20' }]}>
          <View style={styles.statChip}>
            <ThemedText style={[styles.statChipLabel, { color: colors.icon }]}>{Strings.company.cashSales}</ThemedText>
            <ThemedText style={[styles.statChipValue, { color: colors.text }]}>{formatPrice(roundMoney(stats.cashTotal), currency)}</ThemedText>
          </View>
          <View style={[styles.statChipDivider, { backgroundColor: colors.icon + '20' }]} />
          <View style={styles.statChip}>
            <ThemedText style={[styles.statChipLabel, { color: colors.icon }]}>{Strings.company.onlineSales}</ThemedText>
            <ThemedText style={[styles.statChipValue, { color: colors.text }]}>{formatPrice(roundMoney(stats.onlineTotal), currency)}</ThemedText>
          </View>
          <View style={[styles.statChipDivider, { backgroundColor: colors.icon + '20' }]} />
          <View style={styles.statChip}>
            <ThemedText style={[styles.statChipLabel, { color: colors.icon }]}>Refunds</ThemedText>
            <ThemedText style={[styles.statChipValue, { color: '#C62828' }]}>{formatPrice(roundMoney(stats.totalRefunds), currency)}</ThemedText>
          </View>
        </View>
      </View>

      {/* Filter tabs — flexShrink:0 on chips so they don’t collapse (esp. web / narrow layouts) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersScroll}
      >
        {FILTERS.map((f, chipIndex) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={({ pressed }) => [
                styles.chip,
                chipIndex < FILTERS.length - 1 && styles.chipSpacing,
                active
                  ? { backgroundColor: colors.tint }
                  : { backgroundColor: colors.icon + '12', borderWidth: 1, borderColor: colors.icon + '22' },
                pressed && { opacity: 0.85 },
              ]}
            >
              <ThemedText
                numberOfLines={1}
                includeFontPadding={false}
                style={[styles.chipText, active ? { color: '#fff' } : { color: colors.text }]}
              >
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.listArea}>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.listArea}>
          <View style={styles.center}>
            <ThemedText style={{ color: colors.icon }}>{Strings.company.noOrdersFound}</ThemedText>
          </View>
        </View>
      ) : (
        <View style={styles.listArea}>
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => item.server_order_id ?? `order-${index}`}
            renderItem={renderOrder}
            renderSectionHeader={renderSectionHeader}
            style={styles.sectionList}
            contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
          />
        </View>
      )}

      {/* Order detail modal */}
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
              {selectedOrder.refund_amount > 0 && (
                <ThemedText style={[styles.detailRow, { color: '#C62828' }]}>
                  <ThemedText style={{ color: colors.icon }}>Refunds: </ThemedText>
                  {formatPrice(selectedOrder.refund_amount, selectedOrder.currency)}
                </ThemedText>
              )}
              <View style={[styles.detailDivider, { backgroundColor: colors.icon + '20' }]} />

              {loadingItems ? (
                <View style={styles.itemsLoading}>
                  <ActivityIndicator size="small" color={colors.tint} />
                  <ThemedText style={{ color: colors.icon, fontSize: 13, marginTop: 8 }}>Loading items…</ThemedText>
                </View>
              ) : (
                (selectedOrder.items ?? []).map((line, idx) => (
                  <View key={idx} style={[styles.detailItemRow, { borderBottomColor: colors.icon + '15' }]}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ color: colors.text }} numberOfLines={2}>
                        {line.product_name}
                      </ThemedText>
                      {line.size?.trim() ? (
                        <ThemedText style={{ color: colors.icon, fontSize: 12 }}>Size: {line.size.trim()}</ThemedText>
                      ) : null}
                      {line.transaction_type === 'request' ? (
                        <View style={[styles.detailItemTxnBadge, { backgroundColor: '#FFF3E0' }]}>
                          <ThemedText style={[styles.detailItemTxnBadgeText, { color: '#E65100' }]}>
                            {Strings.company.itemLineRequested}
                          </ThemedText>
                        </View>
                      ) : line.transaction_type === 'refund' ? (
                        <View style={[styles.detailItemTxnBadge, { backgroundColor: '#FFEBEE' }]}>
                          <ThemedText style={[styles.detailItemTxnBadgeText, { color: '#C62828' }]}>
                            {Strings.company.itemLineRefunded}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
                      {line.quantity} × {formatPrice(line.unit_price, selectedOrder.currency)} = {formatPrice(line.total, selectedOrder.currency)}
                    </ThemedText>
                  </View>
                ))
              )}

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

      {/* Date filter modal */}
      <Modal
        visible={showDateFilter}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDateFilter(false)}
      >
        <Pressable style={styles.dateFilterOverlay} onPress={() => setShowDateFilter(false)} />
        <ThemedView style={[styles.dateFilterSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '25' }]}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {Strings.company.filterByDate}
            </ThemedText>
            <Pressable onPress={() => setShowDateFilter(false)} hitSlop={12} style={styles.modalCloseBtn}>
              <ThemedText style={{ color: colors.icon }}>{Strings.common.cancel}</ThemedText>
            </Pressable>
          </View>

          <View style={styles.dateFilterBody}>
            {/* Preset chips */}
            {([
              { value: 'today' as DatePreset, label: Strings.company.today },
              { value: '3days' as DatePreset, label: Strings.company.last3Days },
              { value: 'custom' as DatePreset, label: Strings.company.customRange },
            ]).map((p) => {
              const active = draftPreset === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setDraftPreset(active ? null : p.value)}
                  style={[
                    styles.datePresetChip,
                    active
                      ? { backgroundColor: colors.tint, borderColor: colors.tint }
                      : { backgroundColor: 'transparent', borderColor: colors.icon + '40' },
                  ]}
                >
                  <ThemedText
                    includeFontPadding={false}
                    style={[styles.chipText, active ? { color: '#fff' } : { color: colors.text }]}
                  >
                    {p.label}
                  </ThemedText>
                </Pressable>
              );
            })}

            {/* Custom date inputs */}
            {draftPreset === 'custom' && (
              <View style={styles.customDatesRow}>
                <View style={styles.customDateField}>
                  <ThemedText style={[styles.customDateLabel, { color: colors.icon }]}>{Strings.company.from}</ThemedText>
                  <TextInput
                    style={[styles.customDateInput, { borderColor: colors.icon + '40', color: colors.text, backgroundColor: colors.background }]}
                    placeholder="DD MMM YYYY"
                    placeholderTextColor={colors.icon}
                    value={draftFrom}
                    onChangeText={setDraftFrom}
                    keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
                  />
                </View>
                <View style={styles.customDateField}>
                  <ThemedText style={[styles.customDateLabel, { color: colors.icon }]}>{Strings.company.to}</ThemedText>
                  <TextInput
                    style={[styles.customDateInput, { borderColor: colors.icon + '40', color: colors.text, backgroundColor: colors.background }]}
                    placeholder="DD MMM YYYY"
                    placeholderTextColor={colors.icon}
                    value={draftTo}
                    onChangeText={setDraftTo}
                    keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
                  />
                </View>
              </View>
            )}

            <View style={styles.dateFilterActions}>
              <Pressable
                onPress={clearDateFilter}
                style={[styles.dateFilterBtn, { borderColor: colors.icon + '40', backgroundColor: 'transparent' }]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{Strings.company.clearFilter}</ThemedText>
              </Pressable>
              <Pressable
                onPress={applyDateFilter}
                style={[styles.dateFilterBtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '600' }}>{Strings.company.applyFilter}</ThemedText>
              </Pressable>
            </View>
          </View>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header buttons
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  headerIconBtn: { padding: 4 },
  filterIconBtn: { padding: 4, position: 'relative' },
  filterActiveDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Summary card
  totalCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 28, marginTop: 4, marginBottom: 12 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    width: '100%',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  statChipLabel: { fontSize: 11, fontWeight: '500' },
  statChipValue: { fontSize: 15, fontWeight: '700' },
  statChipDivider: { width: 1, alignSelf: 'stretch' },

  // Filter chips — no maxHeight on horizontal ScrollView (Android clips text when content is taller)
  filtersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
  },
  filtersContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 20,
  },
  chip: {
    flexShrink: 0,
    flexGrow: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSpacing: {
    marginRight: 8,
  },
  /** Explicit lineHeight + includeFontPadding=false avoids Android cutting off pill labels. */
  chipText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },

  // List — flex:1 + minHeight:0 so SectionList gets height on web and native
  listArea: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  sectionList: {
    flex: 1,
    width: '100%',
  },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  separator: { height: 8 },
  loadMoreFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 16 },

  // Section header
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sectionHeaderPill: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionHeaderText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Order card
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
  orderId: { fontSize: 12, fontWeight: '500', flex: 1 },
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

  // Detail modal
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
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  detailItemTxnBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  detailItemTxnBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemsLoading: { alignItems: 'center', paddingVertical: 24 },
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

  // Date filter sheet
  dateFilterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dateFilterSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  dateFilterBody: { padding: 16, gap: 12 },
  datePresetChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  customDatesRow: { flexDirection: 'row', gap: 12 },
  customDateField: { flex: 1, gap: 6 },
  customDateLabel: { fontSize: 12, fontWeight: '600' },
  customDateInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  dateFilterActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  dateFilterBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
});
