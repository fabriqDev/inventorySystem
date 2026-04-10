import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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

import { toBackendError, toUserMessage } from '@/core/backend/errors';
import type { FetchOrdersOptions, FetchOrdersWithItemsExportOptions } from '@/core/api/orders';
import {
  cancelOrder,
  fetchAllOrdersForExport,
  fetchOrderItems,
  fetchOrders,
  fetchOrdersWithItemsForExport,
} from '@/core/api/orders';
import { ConfirmActionModal } from '@/core/components/confirm-action-modal';
import { SalesDatePresetPicker, type SalesDatePreset } from '@/core/components/sales-date-preset-picker';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatDate, formatPrice, roundMoney } from '@/core/services/format';
import {
  exportOrdersCsv,
  exportOrdersWithLineItemsCsv,
  filterOrdersForExport,
} from '@/core/services/orders-export-csv';
import { orderItemsToReceiptLineItems } from '@/core/services/printing';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import {
  getPaymentDisplayKey,
  OrderStatus,
  PaymentType,
  stockAdjustmentsForCancelledOrder,
  type OrderItem,
  type OrderStats,
  type OrderStatusEnum,
  type OrderWithItems,
} from '@/core/types/order';

// ── Types ────────────────────────────────────────────────────────────────────

type FilterValue = OrderStatusEnum | 'all' | 'refund' | 'cash' | 'online';

interface DateFilter {
  preset: SalesDatePreset | null;
  from: string;
  to: string;
}

interface OrderSection {
  title: string;
  data: OrderWithItems[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 50;

/** Date filter sheet: selected preset / calendar / Apply (not app theme tint). */
const DATE_FILTER_SHEET_ACCENT = '#45B300';
/** Header badge when a date filter is applied. */
const DATE_FILTER_ACTIVE_BADGE = '#C62828';

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: Strings.company.all, value: 'all' },
  { label: Strings.company.success, value: OrderStatus.SUCCESS },
  { label: Strings.company.failed, value: OrderStatus.FAILED },
  { label: Strings.company.pending, value: OrderStatus.PENDING },
  { label: Strings.company.cancelledTab, value: OrderStatus.CANCELLED },
  { label: Strings.company.refundTab, value: 'refund' },
];

const STATUS_STYLE: Record<
  OrderStatusEnum,
  { bg: string; fg: string; icon: Parameters<typeof IconSymbol>[0]['name'] }
> = {
  [OrderStatus.SUCCESS]: { bg: '#E8F5E9', fg: '#2E7D32', icon: 'checkmark.circle.fill' },
  [OrderStatus.FAILED]: { bg: '#FFEBEE', fg: '#C62828', icon: 'xmark.circle.fill' },
  [OrderStatus.PENDING]: { bg: '#FFF3E0', fg: '#E65100', icon: 'clock.fill' },
  [OrderStatus.CANCELLED]: { bg: '#F5F5F5', fg: '#616161', icon: 'slash.circle' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function paymentLabelForOrder(order: Pick<OrderWithItems, 'payment_type' | 'payment_provider'>): string {
  const key = getPaymentDisplayKey(order);
  return Strings.company[key];
}

/** One comma-separated line for checkout `customer_details` JSON (list + modal). */
function formatCustomerDetailsLine(details: unknown): string | null {
  if (details == null || typeof details !== 'object' || Array.isArray(details)) return null;
  const o = details as Record<string, unknown>;
  const take = (keys: string[]) => {
    for (const key of keys) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  const parts: string[] = [];
  const name = take(['student_name', 'name']);
  const cls = take(['student_class', 'class']);
  const parent = take(['parent_name']);
  const phone = take(['parent_phone', 'phone']);
  if (name) parts.push(name);
  if (cls) parts.push(cls);
  if (parent) parts.push(parent);
  if (phone) parts.push(phone);
  return parts.length > 0 ? parts.join(', ') : null;
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

/** Prefer YYYY-MM-DD, then legacy typed dates. */
function parseFilterDate(str: string): Date | null {
  const t = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return parseDateInput(t);
}

function toYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateFilterToRangeYmd(fromStr: string, toStr: string): { from: string; to: string } {
  const a = parseFilterDate(fromStr);
  const b = parseFilterDate(toStr);
  if (a && b) return { from: toYyyyMmDd(a), to: toYyyyMmDd(b) };
  return { from: '', to: '' };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();
  const { adjustStock } = useProductCache();

  // Filter tabs
  const [filter, setFilter] = useState<FilterValue>('all');

  // Date filter modal
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>({ preset: null, from: '', to: '' });
  const [draftPreset, setDraftPreset] = useState<SalesDatePreset | null>(null);
  const [draftRange, setDraftRange] = useState({ from: '', to: '' });

  const [appliedOrderIdFilter, setAppliedOrderIdFilter] = useState('');
  const [showOrderIdSearchModal, setShowOrderIdSearchModal] = useState(false);
  const [draftOrderIdSearch, setDraftOrderIdSearch] = useState('');

  // Orders data
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    totalRevenue: 0,
    totalRefunds: 0,
    cashTotal: 0,
    onlineTotal: 0,
    totalCancelled: 0,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Order detail modal
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [showCancelOrderConfirm, setShowCancelOrderConfirm] = useState(false);
  /** Inline error on order detail modal (toasts sit behind RN Modal). */
  const [orderDetailError, setOrderDetailError] = useState<string | null>(null);
  const [exportFormatModalVisible, setExportFormatModalVisible] = useState(false);
  const [csvExportKind, setCsvExportKind] = useState<'summary' | 'lineItems'>('summary');
  const [exportCsvConfirmVisible, setExportCsvConfirmVisible] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const itemCacheRef = useRef<Record<string, OrderItem[]>>({});

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (!selectedOrder) {
      setShowCancelOrderConfirm(false);
      setOrderDetailError(null);
    }
  }, [selectedOrder]);

  // ── Manual refresh ────────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    itemCacheRef.current = {};
    setRefreshKey((k) => k + 1);
  }, []);

  const runCancelOrder = useCallback(
    async (orderId: string, lineItems: OrderItem[]) => {
      if (useMockData) return;
      setOrderDetailError(null);
      setCancellingOrder(true);
      try {
        await cancelOrder(orderId, useMockData);
        const stockAdj = stockAdjustmentsForCancelledOrder(lineItems);
        if (id && stockAdj.length > 0) {
          adjustStock(id, stockAdj);
        }
        toast.show({ type: 'success', message: Strings.company.cancelOrderSuccess });
        setShowCancelOrderConfirm(false);
        setSelectedOrder(null);
        handleRefresh();
      } catch (e) {
        setOrderDetailError(toUserMessage(toBackendError(e)));
        setShowCancelOrderConfirm(false);
      } finally {
        setCancellingOrder(false);
      }
    },
    [id, useMockData, handleRefresh, adjustStock],
  );

  const promptCancelOrder = useCallback(() => {
    if (!selectedOrder?.server_order_id || useMockData) return;
    setOrderDetailError(null);
    setShowCancelOrderConfirm(true);
  }, [selectedOrder, useMockData]);

  const handleCancelOrderConfirm = useCallback(() => {
    const oid = selectedOrder?.server_order_id;
    if (!oid || useMockData) return;
    void runCancelOrder(oid, selectedOrder.items ?? []);
  }, [selectedOrder, useMockData, runCancelOrder]);

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
    } else if (dateFilter.preset === '7days') {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      opts.dateFrom = startOfDay(from).toISOString();
      opts.dateTo = endOfDay(now).toISOString();
    } else if (dateFilter.preset === '1month') {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 29);
      opts.dateFrom = startOfDay(from).toISOString();
      opts.dateTo = endOfDay(now).toISOString();
    } else if (dateFilter.preset === 'custom') {
      const from = parseFilterDate(dateFilter.from);
      const to = parseFilterDate(dateFilter.to);
      if (from) opts.dateFrom = startOfDay(from).toISOString();
      if (to) opts.dateTo = endOfDay(to).toISOString();
    }
    return opts;
  }, [dateFilter]);

  const runOrdersCsvExport = useCallback(async () => {
    if (!id || exportingCsv) return;
    setExportingCsv(true);
    try {
      const o = buildFetchOptions(1);
      const { page: _page, limit: _limit, ...exportBase } = o;
      if (csvExportKind === 'lineItems') {
        const itemOpts: FetchOrdersWithItemsExportOptions = {};
        if (exportBase.dateFrom && exportBase.dateTo) {
          itemOpts.dateFrom = exportBase.dateFrom;
          itemOpts.dateTo = exportBase.dateTo;
        }
        const withItems = await fetchOrdersWithItemsForExport(id, itemOpts, useMockData);
        const filtered = filterOrdersForExport(withItems, filter, appliedOrderIdFilter);
        const res = await exportOrdersWithLineItemsCsv(filtered, id);
        if (res.ok) {
          toast.show({ type: 'success', message: Strings.company.ordersExportCsvSuccess });
          setExportCsvConfirmVisible(false);
        } else if (res.reason === 'empty') {
          toast.show({ type: 'info', message: Strings.company.ordersExportCsvEmpty });
        } else {
          toast.show({ type: 'error', message: Strings.company.ordersExportCsvError });
        }
      } else {
        const all = await fetchAllOrdersForExport(id, exportBase, useMockData);
        const filtered = filterOrdersForExport(all, filter, appliedOrderIdFilter);
        const res = await exportOrdersCsv(filtered, id);
        if (res.ok) {
          toast.show({ type: 'success', message: Strings.company.ordersExportCsvSuccess });
          setExportCsvConfirmVisible(false);
        } else if (res.reason === 'empty') {
          toast.show({ type: 'info', message: Strings.company.ordersExportCsvEmpty });
        } else {
          toast.show({ type: 'error', message: Strings.company.ordersExportCsvError });
        }
      }
    } catch {
      toast.show({ type: 'error', message: Strings.company.ordersExportCsvError });
    } finally {
      if (mountedRef.current) setExportingCsv(false);
    }
  }, [
    id,
    exportingCsv,
    buildFetchOptions,
    useMockData,
    filter,
    appliedOrderIdFilter,
    csvExportKind,
  ]);

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
    let list: OrderWithItems[];
    if (filter === 'all') list = orders;
    else if (filter === 'refund') list = orders.filter((o) => o.refund_amount > 0);
    else if (filter === 'cash') list = orders.filter((o) => o.payment_type === PaymentType.CASH);
    else if (filter === 'online') {
      list = orders.filter(
        (o) => o.payment_type === PaymentType.ONLINE || o.payment_type === PaymentType.SPLIT,
      );
    } else list = orders.filter((o) => o.status === filter);

    const q = appliedOrderIdFilter.trim().replace(/^#/, '').toLowerCase();
    if (!q) return list;
    return list.filter((o) => (o.server_order_id ?? '').toLowerCase().includes(q));
  }, [orders, filter, appliedOrderIdFilter]);

  // ── Section data ──────────────────────────────────────────────────────────

  const sections = useMemo(() => groupByDate(filteredOrders), [filteredOrders]);

  // ── Active stats for current filter ──────────────────────────────────────

  /**
   * Top summary: success-only revenue for most tabs (matches chips).
   * Refunds / Cancelled tabs show dedicated totals (same scope as date filter).
   */
  const primaryStat = useMemo(() => {
    if (filter === OrderStatus.CANCELLED) {
      return {
        label: Strings.company.ordersSummaryCancelledTotal,
        value: stats.totalCancelled,
        valueColor: '#616161' as const,
      };
    }
    if (filter === 'refund') {
      return {
        label: Strings.company.totalRefunds,
        value: stats.totalRefunds,
        valueColor: '#C62828' as const,
      };
    }
    return {
      label: Strings.company.totalSales,
      value: stats.totalRevenue,
      valueColor: null as null,
    };
  }, [filter, stats.totalCancelled, stats.totalRefunds, stats.totalRevenue]);

  const currency = orders[0]?.currency ?? CURRENCY_DEFAULT;

  // ── Open order detail (lazy-load items) ──────────────────────────────────

  const openReceiptFromOrderDetail = useCallback(() => {
    if (!id || !selectedOrder?.server_order_id || loadingItems) return;
    const lines = selectedOrder.items ?? [];
    if (lines.length === 0) {
      toast.show({ type: 'info', message: Strings.company.orderDetailsPrintNeedItems });
      return;
    }
    const itemsJson = encodeURIComponent(JSON.stringify(orderItemsToReceiptLineItems(lines)));
    const order = selectedOrder;
    setSelectedOrder(null);
    router.push({
      pathname: '/company/[id]/receipt-preview',
      params: {
        id,
        orderId: order.server_order_id,
        total: String(order.total),
        payment_type: order.payment_type,
        payment_provider: order.payment_provider,
        itemsJson,
        currency: order.currency,
        createdAt: order.created_at,
        afterDone: 'orders',
      },
    } as any);
  }, [id, selectedOrder, loadingItems, router]);

  const handleOpenOrder = useCallback(async (order: OrderWithItems) => {
    setOrderDetailError(null);
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
    if (dateFilter.preset === 'custom') {
      setDraftRange(dateFilterToRangeYmd(dateFilter.from, dateFilter.to));
    } else {
      setDraftRange({ from: '', to: '' });
    }
    setShowDateFilter(true);
  }, [dateFilter]);

  const applyDateFilter = useCallback(() => {
    if (draftPreset === null) {
      setShowDateFilter(false);
      return;
    }
    if (draftPreset === 'custom') {
      if (!draftRange.from || !draftRange.to) return;
      setDateFilter({ preset: 'custom', from: draftRange.from, to: draftRange.to });
    } else {
      setDateFilter({ preset: draftPreset, from: '', to: '' });
    }
    setShowDateFilter(false);
  }, [draftPreset, draftRange]);

  const clearDateFilter = useCallback(() => {
    setDateFilter({ preset: null, from: '', to: '' });
    setShowDateFilter(false);
  }, []);

  const onSelectFilterPreset = useCallback((p: SalesDatePreset) => {
    setDraftPreset(p);
    if (p !== 'custom') setDraftRange({ from: '', to: '' });
  }, []);

  const onFilterCalendarDay = useCallback((day: { dateString: string }) => {
    const d = day.dateString;
    setDraftRange(({ from, to }) => {
      if (!from || to) return { from: d, to: '' };
      if (d < from) return { from: d, to: from };
      return { from, to: d };
    });
  }, []);

  const hasActiveDateFilter = dateFilter.preset !== null;
  const hasActiveOrderIdSearch = appliedOrderIdFilter.trim().length > 0;

  const csvExportConfirmMessage = useMemo(() => {
    const filterLabel = FILTERS.find((f) => f.value === filter)?.label ?? String(filter);
    let dateLine: string = Strings.company.ordersExportScopeAllDates;
    if (hasActiveDateFilter) {
      if (dateFilter.preset === 'custom') {
        const r = dateFilterToRangeYmd(dateFilter.from, dateFilter.to);
        if (r.from && r.to) dateLine = `${r.from} – ${r.to}`;
        else dateLine = Strings.company.ordersExportScopeAllDates;
      } else if (dateFilter.preset === 'today') dateLine = Strings.company.today;
      else if (dateFilter.preset === '3days') dateLine = Strings.company.last3Days;
      else if (dateFilter.preset === '7days') dateLine = Strings.company.last7Days;
      else if (dateFilter.preset === '1month') dateLine = Strings.company.last1Month;
    }
    const formatLabel =
      csvExportKind === 'lineItems'
        ? Strings.company.ordersExportScopeFormatLineItems
        : Strings.company.ordersExportScopeFormatSummary;
    let msg = `${Strings.company.ordersExportScopeIntro}\n\n• ${Strings.company.ordersExportScopeFilter}: ${filterLabel}\n• ${Strings.company.ordersExportScopeDate}: ${dateLine}\n• ${Strings.company.ordersExportScopeFormat}: ${formatLabel}`;
    const q = appliedOrderIdFilter.trim().replace(/^#/, '');
    if (q) msg += `\n• ${Strings.company.ordersExportScopeOrderSearch}: ${q}`;
    if (!hasActiveDateFilter) {
      msg += `\n\n${Strings.company.ordersExportNoDateWarning}`;
      if (csvExportKind === 'lineItems') msg += Strings.company.ordersExportNoDateExtraLineItems;
    }
    return msg;
  }, [filter, hasActiveDateFilter, dateFilter, appliedOrderIdFilter, csvExportKind]);

  const openOrderIdSearchModal = useCallback(() => {
    setDraftOrderIdSearch(appliedOrderIdFilter);
    setShowOrderIdSearchModal(true);
  }, [appliedOrderIdFilter]);

  const applyOrderIdSearch = useCallback(() => {
    setAppliedOrderIdFilter(draftOrderIdSearch.trim().replace(/^#/, ''));
    setShowOrderIdSearchModal(false);
  }, [draftOrderIdSearch]);

  const clearOrderIdSearchFilter = useCallback(() => {
    setDraftOrderIdSearch('');
    setAppliedOrderIdFilter('');
    setShowOrderIdSearchModal(false);
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderOrder = useCallback(
    ({ item }: { item: OrderWithItems }) => {
      const s = STATUS_STYLE[item.status];
      const showRefundAmount = filter === 'refund' && item.refund_amount > 0;
      const isNegative = item.total < 0;
      const customerLine = formatCustomerDetailsLine(item.customer_details);
      const noteText = item.notes?.trim() ?? '';
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
          {customerLine ? (
            <ThemedText style={[styles.cardCustomerLine, { color: colors.text }]} numberOfLines={2}>
              <ThemedText style={[styles.cardLinePrefix, { color: colors.text }]}>
                {Strings.company.orderListBuyerDetailsPrefix}
              </ThemedText>
              {customerLine}
            </ThemedText>
          ) : null}
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
          {noteText ? (
            <ThemedText style={[styles.cardNote, { color: colors.icon }]} numberOfLines={4}>
              <ThemedText style={[styles.cardLinePrefix, { color: colors.icon }]}>
                {Strings.company.orderListCommentPrefix}
              </ThemedText>
              {noteText}
            </ThemedText>
          ) : null}
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
              <Pressable
                onPress={() => setExportFormatModalVisible(true)}
                hitSlop={10}
                style={styles.headerIconBtn}
                disabled={!id || loading}
                accessibilityRole="button"
                accessibilityLabel={Strings.company.ordersExportCsvA11y}
              >
                <IconSymbol name="square.and.arrow.down" size={22} color={colors.icon} />
              </Pressable>
              <Pressable onPress={openDateFilter} hitSlop={10} style={styles.filterIconBtn}>
                <IconSymbol
                  name="line.3.horizontal.decrease.circle"
                  size={24}
                  color={hasActiveDateFilter ? DATE_FILTER_SHEET_ACCENT : colors.icon}
                />
                {hasActiveDateFilter && (
                  <View style={[styles.filterActiveDot, { backgroundColor: DATE_FILTER_ACTIVE_BADGE }]} />
                )}
              </Pressable>
              <Pressable
                onPress={openOrderIdSearchModal}
                hitSlop={10}
                style={styles.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel={Strings.company.ordersSearchOrderIdA11y}
              >
                <View style={styles.searchIconWrap}>
                  <IconSymbol name="magnifyingglass" size={22} color={colors.icon} />
                  {hasActiveOrderIdSearch ? (
                    <View
                      style={[
                        styles.searchFilterActiveDot,
                        { backgroundColor: colors.tint, borderColor: colors.background },
                      ]}
                    />
                  ) : null}
                </View>
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Summary card */}
      <View style={[styles.totalCard, { backgroundColor: colors.tint + '10', borderColor: colors.tint + '30' }]}>
        <ThemedText style={[styles.totalLabel, { color: colors.tint }]}>{primaryStat.label}</ThemedText>
        <ThemedText
          type="title"
          style={[styles.totalValue, { color: primaryStat.valueColor ?? colors.tint }]}
        >
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
            <View style={styles.modalHeaderActions}>
              <Pressable
                onPress={openReceiptFromOrderDetail}
                disabled={
                  !selectedOrder?.server_order_id ||
                  loadingItems ||
                  (selectedOrder?.items?.length ?? 0) === 0
                }
                hitSlop={8}
                style={({ pressed }) => [
                  styles.modalHeaderActionBtn,
                  (!selectedOrder?.server_order_id ||
                    loadingItems ||
                    (selectedOrder?.items?.length ?? 0) === 0) &&
                    styles.modalHeaderActionBtnDisabled,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>{Strings.common.print}</ThemedText>
              </Pressable>
              <Pressable onPress={() => setSelectedOrder(null)} hitSlop={12} style={styles.modalCloseBtn}>
                <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>{Strings.common.done}</ThemedText>
              </Pressable>
            </View>
          </View>
          {orderDetailError ? (
            <View style={styles.orderDetailErrorBanner}>
              <ThemedText style={styles.orderDetailErrorText} numberOfLines={4}>
                {orderDetailError}
              </ThemedText>
              <Pressable
                onPress={() => setOrderDetailError(null)}
                hitSlop={8}
                style={styles.orderDetailErrorDismiss}
              >
                <ThemedText style={styles.orderDetailErrorDismissText}>{Strings.common.dismiss}</ThemedText>
              </Pressable>
            </View>
          ) : null}
          {selectedOrder && (
            <>
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
              {formatCustomerDetailsLine(selectedOrder.customer_details) ? (
                <View style={styles.detailBlock}>
                  <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>
                    {Strings.company.checkoutBuyerDetailsTitle}
                  </ThemedText>
                  <ThemedText style={[styles.detailValueMultiline, { color: colors.text }]}>
                    {formatCustomerDetailsLine(selectedOrder.customer_details)}
                  </ThemedText>
                </View>
              ) : null}
              {selectedOrder.notes?.trim() ? (
                <View style={styles.detailBlock}>
                  <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>
                    {Strings.company.checkoutOrderNotesLabel}
                  </ThemedText>
                  <ThemedText style={[styles.detailValueMultiline, { color: colors.text }]}>
                    {selectedOrder.notes.trim()}
                  </ThemedText>
                </View>
              ) : null}
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
            {selectedOrder.status === OrderStatus.SUCCESS && !useMockData ? (
              <View style={[styles.modalFooter, { borderTopColor: colors.icon + '20', backgroundColor: colors.background }]}>
                <Pressable
                  onPress={promptCancelOrder}
                  disabled={cancellingOrder}
                  style={({ pressed }) => [
                    styles.cancelOrderBtn,
                    pressed && !cancellingOrder && { opacity: 0.88 },
                    cancellingOrder && styles.cancelOrderBtnDisabled,
                  ]}
                >
                  {cancellingOrder ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.cancelOrderBtnText}>{Strings.company.cancelOrder}</ThemedText>
                  )}
                </Pressable>
              </View>
            ) : null}
            </>
          )}
          <ConfirmActionModal
            presentation="overlay"
            visible={showCancelOrderConfirm && selectedOrder != null}
            onClose={() => !cancellingOrder && setShowCancelOrderConfirm(false)}
            title={Strings.company.cancelOrderConfirmTitle}
            message={Strings.company.cancelOrderConfirmMessage}
            cancelLabel={Strings.common.cancel}
            confirmLabel={Strings.common.confirm}
            confirmColor="#C62828"
            loading={cancellingOrder}
            onConfirm={handleCancelOrderConfirm}
          />
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

          <ScrollView
            style={styles.dateFilterScroll}
            contentContainerStyle={styles.dateFilterBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SalesDatePresetPicker
              activePreset={draftPreset}
              onSelectPreset={onSelectFilterPreset}
              rangeFrom={draftRange.from}
              rangeTo={draftRange.to}
              onDayPress={onFilterCalendarDay}
              tint={DATE_FILTER_SHEET_ACCENT}
              colors={{ text: colors.text, icon: colors.icon, background: colors.background }}
            />
            <View style={styles.dateFilterActions}>
              <Pressable
                onPress={clearDateFilter}
                style={[styles.dateFilterBtn, { borderColor: '#C62828', backgroundColor: '#FFEBEE' }]}
              >
                <ThemedText style={{ color: '#C62828', fontWeight: '600' }}>{Strings.company.clearFilter}</ThemedText>
              </Pressable>
              <Pressable
                onPress={applyDateFilter}
                disabled={
                  draftPreset === null ||
                  (draftPreset === 'custom' && (!draftRange.from || !draftRange.to))
                }
                style={[
                  styles.dateFilterBtn,
                  {
                    backgroundColor:
                      draftPreset === null ||
                      (draftPreset === 'custom' && (!draftRange.from || !draftRange.to))
                        ? colors.icon + '35'
                        : colors.tint,
                    borderColor:
                      draftPreset === null ||
                      (draftPreset === 'custom' && (!draftRange.from || !draftRange.to))
                        ? 'transparent'
                        : colors.tint,
                  },
                ]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '600' }}>{Strings.company.applyFilter}</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>

      <Modal
        visible={showOrderIdSearchModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowOrderIdSearchModal(false)}
      >
        <View style={styles.orderIdAlertRoot}>
          <Pressable
            style={[styles.orderIdAlertBackdrop, StyleSheet.absoluteFillObject]}
            onPress={() => setShowOrderIdSearchModal(false)}
            accessibilityRole="button"
            accessibilityLabel={Strings.common.cancel}
          />
          <ThemedView
            style={[
              styles.orderIdAlertCard,
              { backgroundColor: colors.background, borderColor: colors.icon + '22' },
            ]}
          >
            <ThemedText type="subtitle" style={[styles.orderIdAlertTitle, { color: colors.text }]}>
              {Strings.company.ordersSearchOrderIdModalTitle}
            </ThemedText>
            <TextInput
              style={[
                styles.orderIdModalInput,
                { borderColor: colors.icon + '30', color: colors.text },
              ]}
              placeholder={Strings.company.ordersSearchOrderIdPlaceholder}
              placeholderTextColor={colors.icon}
              value={draftOrderIdSearch}
              onChangeText={setDraftOrderIdSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => applyOrderIdSearch()}
            />
            <View style={styles.orderIdAlertActions}>
              <Pressable
                onPress={() => setShowOrderIdSearchModal(false)}
                style={[styles.orderIdAlertBtn, { borderColor: colors.icon + '40', backgroundColor: colors.icon + '10' }]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{Strings.common.cancel}</ThemedText>
              </Pressable>
              <Pressable
                onPress={applyOrderIdSearch}
                style={[styles.orderIdAlertBtn, styles.orderIdAlertBtnPrimary, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>
                  {Strings.company.ordersSearchOrderIdButton}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable onPress={clearOrderIdSearchFilter} style={styles.orderIdAlertClear}>
              <ThemedText style={{ color: '#C62828', fontWeight: '600', fontSize: 14 }}>
                {Strings.company.requestedOrdersClearSearch}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={exportFormatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportFormatModalVisible(false)}
      >
        <View style={styles.ordersExportFormatRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.orderIdAlertBackdrop]}
            onPress={() => setExportFormatModalVisible(false)}
          />
          <ThemedView
            style={[
              styles.ordersExportFormatCard,
              { backgroundColor: colors.background, borderColor: colors.icon + '22' },
            ]}
          >
            <ThemedText type="subtitle" style={[styles.ordersExportFormatHeading, { color: colors.text }]}>
              {Strings.company.ordersExportFormatTitle}
            </ThemedText>
            <Pressable
              onPress={() => {
                setCsvExportKind('summary');
                setExportFormatModalVisible(false);
                setExportCsvConfirmVisible(true);
              }}
              style={({ pressed }) => [
                styles.ordersExportFormatOption,
                { borderColor: colors.tint, backgroundColor: colors.tint + '14' },
                pressed && { opacity: 0.92 },
              ]}
            >
              <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                {Strings.company.ordersExportFormatSummaryRow}
              </ThemedText>
              <ThemedText style={[styles.ordersExportFormatHint, { color: colors.icon }]}>
                {Strings.company.ordersExportFormatSummaryHint}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                setCsvExportKind('lineItems');
                setExportFormatModalVisible(false);
                setExportCsvConfirmVisible(true);
              }}
              style={({ pressed }) => [
                styles.ordersExportFormatOption,
                { borderColor: colors.tint, backgroundColor: colors.tint + '14' },
                pressed && { opacity: 0.92 },
              ]}
            >
              <ThemedText type="defaultSemiBold" style={{ color: colors.text }}>
                {Strings.company.ordersExportFormatLineItemsRow}
              </ThemedText>
              <ThemedText style={[styles.ordersExportFormatHint, { color: colors.icon }]}>
                {Strings.company.ordersExportFormatLineItemsHint}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setExportFormatModalVisible(false)} style={styles.ordersExportFormatCancel}>
              <ThemedText style={{ color: colors.icon, fontWeight: '600' }}>{Strings.common.cancel}</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <ConfirmActionModal
        visible={exportCsvConfirmVisible}
        onClose={() => !exportingCsv && setExportCsvConfirmVisible(false)}
        title={Strings.company.ordersExportCsvTitle}
        message={csvExportConfirmMessage}
        cancelLabel={Strings.common.cancel}
        confirmLabel={Strings.company.ordersExportCsvDownload}
        confirmColor={colors.tint}
        loading={exportingCsv}
        onConfirm={() => void runOrdersCsvExport()}
      />
    </ThemedView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header buttons
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  headerIconBtn: { padding: 4 },
  searchIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchFilterActiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  orderIdAlertRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  orderIdAlertBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  orderIdAlertCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
  },
  orderIdAlertTitle: {
    textAlign: 'center',
    marginBottom: 14,
    fontSize: 18,
  },
  orderIdModalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  orderIdAlertActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  orderIdAlertBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderIdAlertBtnPrimary: { borderWidth: 0 },
  orderIdAlertClear: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  filterIconBtn: { padding: 4, position: 'relative' },
  filterActiveDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  ordersExportFormatRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  ordersExportFormatCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  ordersExportFormatHeading: { textAlign: 'center', marginBottom: 4 },
  ordersExportFormatOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  ordersExportFormatHint: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  ordersExportFormatCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },

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
  cardCustomerLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardLinePrefix: {
    fontWeight: '600',
  },
  cardNote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
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
  orderDetailErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#C62828',
  },
  orderDetailErrorText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  orderDetailErrorDismiss: { paddingVertical: 2, paddingHorizontal: 4 },
  orderDetailErrorDismissText: { color: '#fff', fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' },
  modalTitle: { flex: 1 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  modalHeaderActionBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  modalHeaderActionBtnDisabled: { opacity: 0.35 },
  modalCloseBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16, paddingBottom: 24 },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelOrderBtn: {
    backgroundColor: '#C62828',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelOrderBtnDisabled: { opacity: 0.65 },
  cancelOrderBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  detailRow: { marginBottom: 8, fontSize: 14 },
  detailBlock: { marginBottom: 10 },
  detailLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  detailValueMultiline: { fontSize: 14, lineHeight: 20 },
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
    maxHeight: Dimensions.get('window').height * (Platform.OS === 'web' ? 0.9 : 0.88),
  },
  dateFilterScroll: { maxHeight: Platform.OS === 'web' ? 520 : 480 },
  dateFilterBody: { padding: 16, gap: 12, paddingBottom: 20 },
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
