import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  fetchAllRequestedOrdersForTab,
  fetchRequestedOrders,
  fetchRequestedOrdersPdfPages,
} from '@/core/api/requested-orders';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatDate, formatPrice } from '@/core/services/format';
import { exportRequestedOrdersCsv } from '@/core/services/requested-orders-csv';
import { toast } from '@/core/services/toast';
import {
  OrderItemRequestField,
  ORDER_ID_FULL_UUID_RE,
  type FulfillmentTab,
  type RequestItemSearchPayload,
  type RequestedOrderListRow,
  type RequestedOrdersPdfVariant,
} from '@/core/types/requested-orders';
import { Strings } from '@/core/strings';

const PAGE_LIMIT = 50;

export default function RequestedItemsListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();

  const [tab, setTab] = useState<FulfillmentTab>('unfulfilled');
  const [searchOpen, setSearchOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<RequestItemSearchPayload>({});
  const [draftOrderId, setDraftOrderId] = useState('');
  const [draftClass, setDraftClass] = useState('');
  const [draftStudent, setDraftStudent] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [appliedOrderIdSearch, setAppliedOrderIdSearch] = useState('');

  const [orders, setOrders] = useState<RequestedOrderListRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  /** Skip bumping refresh on first focus (useEffect already loads); bump when returning e.g. from detail after fulfill/revert. */
  const skipFocusRefreshRef = useRef(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    skipFocusRefreshRef.current = true;
  }, [id]);

  const openSearchModal = useCallback(() => {
    setDraftOrderId(appliedOrderIdSearch);
    setDraftClass(appliedFilters[OrderItemRequestField.STUDENT_CLASS] ?? '');
    setDraftStudent(appliedFilters[OrderItemRequestField.STUDENT_NAME] ?? '');
    setDraftPhone(appliedFilters[OrderItemRequestField.PHONE_NUMBER] ?? '');
    setSearchOpen(true);
  }, [appliedFilters, appliedOrderIdSearch]);

  const applySearch = useCallback(() => {
    const next: RequestItemSearchPayload = {};
    const c = draftClass.trim();
    const s = draftStudent.trim();
    const p = draftPhone.trim();
    if (c) next[OrderItemRequestField.STUDENT_CLASS] = c;
    if (s) next[OrderItemRequestField.STUDENT_NAME] = s;
    if (p) next[OrderItemRequestField.PHONE_NUMBER] = p;
    setAppliedFilters(next);
    setAppliedOrderIdSearch(draftOrderId.trim().replace(/^#/, ''));
    setSearchOpen(false);
  }, [draftClass, draftOrderId, draftStudent, draftPhone]);

  const clearSearchFilters = useCallback(() => {
    setDraftOrderId('');
    setDraftClass('');
    setDraftStudent('');
    setDraftPhone('');
    setAppliedOrderIdSearch('');
    setAppliedFilters({});
    setSearchOpen(false);
  }, []);

  const searchIsActive = useMemo(() => {
    const f = appliedFilters;
    return Boolean(
      appliedOrderIdSearch.trim() ||
        (f[OrderItemRequestField.STUDENT_NAME]?.trim() ?? '') ||
        (f[OrderItemRequestField.STUDENT_CLASS]?.trim() ?? '') ||
        (f[OrderItemRequestField.PHONE_NUMBER]?.trim() ?? ''),
    );
  }, [appliedFilters, appliedOrderIdSearch]);

  const normalizedOrderId = useMemo(
    () => appliedOrderIdSearch.trim().replace(/^#/, ''),
    [appliedOrderIdSearch],
  );

  const orderIdForServerEq = useMemo(() => {
    if (!normalizedOrderId) return undefined;
    if (!ORDER_ID_FULL_UUID_RE.test(normalizedOrderId)) return undefined;
    return normalizedOrderId;
  }, [normalizedOrderId]);

  /** Partial order id: Hasura cannot substring-match uuid; load tab then filter in memory. */
  const orderIdClientContains = useMemo(() => {
    if (!normalizedOrderId) return null;
    if (orderIdForServerEq) return null;
    return normalizedOrderId.toLowerCase();
  }, [normalizedOrderId, orderIdForServerEq]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setOrders([]);
    setPage(1);

    if (orderIdClientContains) {
      fetchAllRequestedOrdersForTab(id, tab, appliedFilters, useMockData)
        .then((all) => {
          if (!mountedRef.current) return;
          const q = orderIdClientContains;
          const filtered = all.filter((o) => o.order_id.toLowerCase().includes(q));
          setOrders(filtered);
          setHasMore(false);
        })
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current) setLoading(false);
        });
      return;
    }

    fetchRequestedOrders(
      id,
      {
        page: 1,
        limit: PAGE_LIMIT,
        tab,
        searchFilters: appliedFilters,
        orderIdSearch: orderIdForServerEq,
      },
      useMockData,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setOrders(res.orders);
        setHasMore(res.orders.length < res.totalCount);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [id, tab, appliedFilters, orderIdForServerEq, orderIdClientContains, useMockData, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      if (skipFocusRefreshRef.current) {
        skipFocusRefreshRef.current = false;
        return;
      }
      setRefreshKey((k) => k + 1);
    }, [id]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (orderIdClientContains) return;
    if (!id || loadingMore || !hasMore || loading) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetchRequestedOrders(
      id,
      {
        page: nextPage,
        limit: PAGE_LIMIT,
        tab,
        searchFilters: appliedFilters,
        orderIdSearch: orderIdForServerEq,
      },
      useMockData,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setOrders((prev) => {
          const merged = [...prev, ...res.orders];
          setHasMore(merged.length < res.totalCount);
          return merged;
        });
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoadingMore(false);
      });
  }, [
    id,
    loadingMore,
    hasMore,
    loading,
    page,
    tab,
    appliedFilters,
    orderIdForServerEq,
    orderIdClientContains,
    useMockData,
  ]);

  const handleOpenExportMenu = useCallback(() => {
    if (!id) return;
    setExportMenuOpen(true);
  }, [id]);

  const runCsvExport = useCallback(
    async (variant: RequestedOrdersPdfVariant) => {
      if (!id || exportBusy) return;
      setExportMenuOpen(false);
      setExportBusy(true);
      try {
        const pages = await fetchRequestedOrdersPdfPages(id, variant, useMockData);
        if (pages.length === 0) {
          toast.show({
            type: 'info',
            message:
              variant === 'unfulfilled'
                ? Strings.company.requestedOrdersPdfEmptyUnfulfilled
                : Strings.company.requestedOrdersPdfEmptyFulfilled,
          });
          return;
        }
        const res = await exportRequestedOrdersCsv(pages, variant, id);
        if (res.ok) {
          toast.show({ type: 'success', message: Strings.company.requestedOrdersCsvSuccess });
        } else {
          toast.show({ type: 'error', message: Strings.company.requestedOrdersCsvError });
        }
      } catch {
        toast.show({ type: 'error', message: Strings.company.requestedOrdersCsvError });
      } finally {
        setExportBusy(false);
      }
    },
    [id, exportBusy, useMockData],
  );

  const onRowPress = useCallback(
    (orderId: string) => {
      router.push(`/company/${id}/requested-items/${orderId}` as any);
    },
    [id, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: RequestedOrderListRow }) => (
      <Pressable
        onPress={() => onRowPress(item.order_id)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.background, borderColor: colors.icon + '25' },
          pressed && { opacity: 0.92 },
        ]}
      >
        <ThemedText type="defaultSemiBold" style={styles.orderId}>
          #{item.order_id}
        </ThemedText>
        <ThemedText style={[styles.studentLine, { color: colors.text }]}>
          {item.student_name}
          {item.has_multiple_students ? ` · ${Strings.company.multipleStudentsNote}` : ''}
        </ThemedText>
        <ThemedText style={[styles.classLine, { color: colors.icon }]}>
          {Strings.company.classLabel}: {item.student_class}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: colors.icon }]}>
          {formatDate(item.created_at)} · {formatPrice(item.total, CURRENCY_DEFAULT)}
        </ThemedText>
      </Pressable>
    ),
    [colors, onRowPress],
  );

  const tabOptions = [
    { label: Strings.company.unfulfilledOrders, value: 'unfulfilled' as const },
    { label: Strings.company.fulfilledOrders, value: 'fulfilled' as const },
  ];

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        <Pressable onPress={handleRefresh} hitSlop={12} style={styles.headerIconBtn}>
          <IconSymbol name="arrow.clockwise" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={handleOpenExportMenu}
          disabled={exportBusy || !id}
          hitSlop={12}
          style={styles.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel={Strings.company.requestedOrdersExportA11y}
        >
          {exportBusy ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <IconSymbol name="square.and.arrow.down" size={22} color={colors.text} />
          )}
        </Pressable>
        <Pressable onPress={openSearchModal} hitSlop={12} style={styles.headerIconBtn}>
          <View style={styles.searchIconWrap}>
            <IconSymbol name="magnifyingglass" size={22} color={colors.text} />
            {searchIsActive ? (
              <View
                style={[
                  styles.searchActiveDot,
                  { backgroundColor: colors.tint, borderColor: colors.background },
                ]}
              />
            ) : null}
          </View>
        </Pressable>
      </View>
    ),
    [
      colors.text,
      colors.tint,
      colors.background,
      exportBusy,
      handleOpenExportMenu,
      handleRefresh,
      id,
      openSearchModal,
      searchIsActive,
    ],
  );

  const inputStyle = [styles.searchInput, { borderColor: colors.icon + '30', color: colors.text }];

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen
        options={{
          title: Strings.company.requestedOrdersTitle,
          headerRight,
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroll}
      >
        {tabOptions.map((opt) => {
          const active = tab === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setTab(opt.value)}
              style={[
                styles.tabPill,
                {
                  backgroundColor: active ? colors.tint + '22' : colors.icon + '12',
                  borderColor: active ? colors.tint : 'transparent',
                },
              ]}
            >
              <ThemedText
                includeFontPadding={false}
                numberOfLines={1}
                style={[
                  styles.tabPillText,
                  {
                    color: active ? colors.tint : colors.icon,
                    fontWeight: active ? '700' : '600',
                  },
                ]}
              >
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          {searchIsActive ? (
            <View style={styles.emptySearchWrap}>
              <ThemedText style={[styles.emptySearchHint, { color: colors.icon }]}>
                {Strings.company.noRequestedOrdersWithSearch}
              </ThemedText>
              <Pressable
                onPress={openSearchModal}
                style={[styles.emptySearchPrimaryBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={styles.emptySearchPrimaryBtnText}>
                  {Strings.company.requestedOrdersSearchAgain}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={clearSearchFilters}
                style={[styles.emptySearchSecondaryBtn, { borderColor: colors.icon + '40' }]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                  {Strings.company.requestedOrdersClearSearch}
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <ThemedText style={{ color: colors.icon }}>{Strings.company.noRequestedOrders}</ThemedText>
          )}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.tint} />
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={searchOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setSearchOpen(false)}
      >
        <View style={[styles.searchAlertRoot, { paddingBottom: insets.bottom }]}>
          <Pressable
            style={[styles.searchAlertBackdrop, StyleSheet.absoluteFillObject]}
            onPress={() => setSearchOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={Strings.common.cancel}
          />
          <ThemedView
            style={[
              styles.searchAlertCard,
              { backgroundColor: colors.background, borderColor: colors.icon + '22' },
            ]}
          >
            <ThemedText type="subtitle" style={[styles.searchAlertTitle, { color: colors.text }]}>
              {Strings.company.searchByStudent}
            </ThemedText>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.searchAlertScroll}
              contentContainerStyle={styles.searchAlertScrollContent}
            >
              <ThemedText style={[styles.containsHint, { color: colors.icon }]}>
                {Strings.company.requestSearchContainsHint}
              </ThemedText>
              <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
                {Strings.company.requestSearchOrderIdLabel}
              </ThemedText>
              <TextInput
                value={draftOrderId}
                onChangeText={setDraftOrderId}
                placeholder={Strings.company.requestSearchOrderIdLabel}
                placeholderTextColor={colors.icon}
                style={inputStyle}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
                {Strings.company.requestSearchClassLabel}
              </ThemedText>
              <TextInput
                value={draftClass}
                onChangeText={setDraftClass}
                placeholder={Strings.company.requestSearchClassLabel}
                placeholderTextColor={colors.icon}
                style={inputStyle}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
                {Strings.company.requestSearchStudentLabel}
              </ThemedText>
              <TextInput
                value={draftStudent}
                onChangeText={setDraftStudent}
                placeholder={Strings.company.requestSearchStudentLabel}
                placeholderTextColor={colors.icon}
                style={inputStyle}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
                {Strings.company.requestSearchPhoneLabel}
              </ThemedText>
              <TextInput
                value={draftPhone}
                onChangeText={setDraftPhone}
                placeholder={Strings.company.requestSearchPhoneLabel}
                placeholderTextColor={colors.icon}
                style={inputStyle}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={applySearch}
              />
            </ScrollView>
            <View style={styles.searchAlertActions}>
              <Pressable
                onPress={() => setSearchOpen(false)}
                style={[
                  styles.searchAlertBtn,
                  { borderColor: colors.icon + '40', backgroundColor: colors.icon + '10' },
                ]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                  {Strings.common.cancel}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={applySearch}
                style={[
                  styles.searchAlertBtn,
                  styles.searchAlertBtnPrimary,
                  { backgroundColor: colors.tint },
                ]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>
                  {Strings.company.requestSearchSubmit}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable onPress={clearSearchFilters} style={styles.searchAlertClear}>
              <ThemedText style={{ color: colors.tint, fontWeight: '600', fontSize: 14 }}>
                {Strings.company.requestSearchClear}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={exportMenuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!exportBusy) setExportMenuOpen(false);
        }}
      >
        <View style={styles.exportPopupRoot}>
          <Pressable
            style={styles.exportPopupBackdrop}
            onPress={() => {
              if (!exportBusy) setExportMenuOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={Strings.common.cancel}
          />
          <ThemedView
            style={[
              styles.exportPopupCard,
              { backgroundColor: colors.background, borderColor: colors.icon + '25' },
            ]}
          >
            <ThemedText type="defaultSemiBold" style={[styles.exportPopupTitle, { color: colors.text }]}>
              {Strings.company.requestedOrdersExportTitle}
            </ThemedText>
            <ThemedText style={[styles.exportMenuMessage, { color: colors.icon }]}>
              {Strings.company.requestedOrdersExportMessage}
            </ThemedText>
            <Pressable
              onPress={() => void runCsvExport('unfulfilled')}
              disabled={exportBusy}
              style={[
                styles.exportPopupPrimaryBtn,
                { backgroundColor: colors.tint, opacity: exportBusy ? 0.6 : 1 },
              ]}
            >
              <ThemedText style={styles.primaryBtnText}>
                {Strings.company.requestedOrdersExportCsvUnfulfilled}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => void runCsvExport('fulfilled')}
              disabled={exportBusy}
              style={[
                styles.exportPopupPrimaryBtn,
                { backgroundColor: colors.tint, marginTop: 10, opacity: exportBusy ? 0.6 : 1 },
              ]}
            >
              <ThemedText style={styles.primaryBtnText}>
                {Strings.company.requestedOrdersExportCsvFulfilled}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!exportBusy) setExportMenuOpen(false);
              }}
              disabled={exportBusy}
              style={styles.exportPopupCancel}
            >
              <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{Strings.common.cancel}</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { padding: 8 },
  searchIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchActiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  /** Avoid maxHeight — Android clips pill text when ScrollView height < content (font scale / padding). */
  tabScroll: { flexGrow: 0, flexShrink: 0, width: '100%' },
  tabRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tabPillText: { fontSize: 14, lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  orderId: { fontSize: 15 },
  studentLine: { fontSize: 15 },
  classLine: { fontSize: 13 },
  meta: { fontSize: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptySearchWrap: { alignItems: 'center', gap: 14, maxWidth: 280 },
  emptySearchHint: { textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  emptySearchPrimaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  emptySearchPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  emptySearchSecondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  searchAlertRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  searchAlertBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  searchAlertCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
  },
  searchAlertTitle: {
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 18,
  },
  searchAlertScroll: {
    flexGrow: 0,
    maxHeight: 420,
  },
  searchAlertScrollContent: {
    paddingBottom: 4,
  },
  searchAlertActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  searchAlertBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAlertBtnPrimary: { borderWidth: 0 },
  searchAlertClear: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  exportPopupRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  exportPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  exportPopupCard: {
    zIndex: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  exportPopupTitle: { fontSize: 18, textAlign: 'center', marginBottom: 10 },
  exportPopupPrimaryBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  exportPopupCancel: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  containsHint: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  exportMenuMessage: { fontSize: 15, lineHeight: 22, marginBottom: 4, textAlign: 'center' },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
});
