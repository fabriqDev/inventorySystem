import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

import { fetchCompanies } from '@/core/api/companies';
import {
  acceptTransfer,
  cancelTransfer,
  createTransfer,
  fetchPendingTransfers,
  fetchTransferHistory,
  fetchTransferableCompanies,
  rejectTransfer,
} from '@/core/api/transfers';
import type { CreateTransferItemInput } from '@/core/backend/types';
import { ProductSearchList } from '@/core/components/product-search-list';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import { useAuth } from '@/core/context/auth-context';
import { useCompany } from '@/core/context/company-context';
import { useDataSource } from '@/core/context/data-source-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatDate } from '@/core/services/format';
import { Strings } from '@/core/strings';
import type { CompanyWithRole } from '@/core/types/company';
import type { Product } from '@/core/types/product';
import type { InventoryTransfer, TransferStatus } from '@/core/types/transfer';

type TabIndex = 0 | 1 | 2;

interface TransferLineItem {
  product: Product;
  quantity: number;
}

const TABS: { label: string; index: TabIndex }[] = [
  { label: Strings.company.createTransfer, index: 0 },
  { label: Strings.company.requests, index: 1 },
  { label: Strings.company.history, index: 2 },
];

const STATUS_STYLE: Record<
  TransferStatus,
  { bg: string; fg: string; icon: Parameters<typeof IconSymbol>[0]['name'] }
> = {
  pending: { bg: '#FFF3E0', fg: '#E65100', icon: 'clock.fill' },
  accepted: { bg: '#E8F5E9', fg: '#2E7D32', icon: 'checkmark.circle.fill' },
  rejected: { bg: '#FFEBEE', fg: '#C62828', icon: 'xmark.circle.fill' },
  cancelled: { bg: '#F5F5F5', fg: '#757575', icon: 'xmark.circle.fill' },
};

export default function InventoryTransferScreen() {
  const { id: companyId } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  useCompany();
  const { session } = useAuth();
  const { useMockData } = useDataSource();
  const { refreshProducts, adjustStock } = useProductCache();
  const userId = session?.user?.id ?? '';

  const [activeTab, setActiveTab] = useState<TabIndex>(0);
  const [companies, setCompanies] = useState<CompanyWithRole[]>([]);
  const [destinationCompanyId, setDestinationCompanyId] = useState<string | null>(null);
  const [transferItems, setTransferItems] = useState<TransferLineItem[]>([]);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [companyPickerVisible, setCompanyPickerVisible] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<InventoryTransfer[]>([]);
  const [historyTransfers, setHistoryTransfers] = useState<InventoryTransfer[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptRejectLoading, setAcceptRejectLoading] = useState<string | null>(null);
  const [detailTransfer, setDetailTransfer] = useState<InventoryTransfer | null>(null);
  const mountedRef = useRef(true);

  const transferableCompanies = companies.length
    ? fetchTransferableCompanies(companies, companyId ?? '')
    : [];

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCompanies(useMockData).then((list: CompanyWithRole[]) => {
      if (!cancelled && mountedRef.current) setCompanies(list);
    });
    return () => { cancelled = true; };
  }, [useMockData]);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      if (activeTab === 1) {
        setLoadingPending(true);
        fetchPendingTransfers(companyId, useMockData)
          .then((data) => { if (mountedRef.current) setPendingTransfers(data); })
          .finally(() => { if (mountedRef.current) setLoadingPending(false); });
      } else if (activeTab === 2) {
        setLoadingHistory(true);
        fetchTransferHistory(companyId, useMockData)
          .then((data) => { if (mountedRef.current) setHistoryTransfers(data); })
          .finally(() => { if (mountedRef.current) setLoadingHistory(false); });
      }
    }, [companyId, activeTab, useMockData]),
  );

  const handleSelectProduct = useCallback((product: Product) => {
    setTransferItems((prev) => {
      const existing = prev.find((i) => i.product.article_code === product.article_code);
      if (existing) {
        const max = Math.max(1, existing.product.quantity ?? 1);
        return prev.map((i) =>
          i.product.article_code === product.article_code
            ? { ...i, quantity: Math.min(i.quantity + 1, max) }
            : i,
        );
      }
      const max = Math.max(1, product.quantity ?? 1);
      return [...prev, { product, quantity: 1 }];
    });
    setAddItemModalVisible(false);
  }, []);

  const updateTransferQuantity = useCallback((productId: string, delta: number) => {
    setTransferItems((prev) =>
      prev.map((item) => {
        if (item.product.article_code !== productId) return item;
        const max = Math.max(1, item.product.quantity ?? 1);
        const next = Math.max(1, Math.min(max, item.quantity + delta));
        return { ...item, quantity: next };
      }),
    );
  }, []);

  const setTransferQuantity = useCallback((productId: string, value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 1) return;
    setTransferItems((prev) =>
      prev.map((item) => {
        if (item.product.article_code !== productId) return item;
        const max = Math.max(1, item.product.quantity ?? 1);
        return { ...item, quantity: Math.min(max, num) };
      }),
    );
  }, []);

  const removeTransferItem = useCallback((productId: string) => {
    setTransferItems((prev) => prev.filter((i) => i.product.article_code !== productId));
  }, []);

  const handleInitiateTransfer = useCallback(async () => {
    if (!companyId || !destinationCompanyId || transferItems.length === 0) return;
    if (!userId) return;
    setSubmitting(true);
    try {
      const items: CreateTransferItemInput[] = transferItems.map((item) => ({
        article_code: item.product.article_code,
        quantity: item.quantity,
      }));
      await createTransfer(
        {
          source_company_id: companyId,
          destination_company_id: destinationCompanyId,
          created_by: userId,
          items,
        },
        useMockData,
      );
      // Transfer created: mark items as reserved for the source company.
      // Only reserved increases — total stock (quantity) stays the same because
      // available stock is computed via getAvailableStock (quantity - reserved).
      adjustStock(
        companyId,
        transferItems.map((i) => ({
          article_code: i.product.article_code,
          quantity_delta: 0,
          reserved_delta: i.quantity,
        })),
      );
      setTransferItems([]);
      setDestinationCompanyId(null);
      setActiveTab(1);
    } catch (_e) {
      // Error could be shown via Alert or toast
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [companyId, destinationCompanyId, transferItems, useMockData, userId, adjustStock]);

  const handleAccept = useCallback(
    async (transferId: string) => {
      setAcceptRejectLoading(transferId);
      try {
        const transfer = pendingTransfers.find((t) => t.id === transferId);
        await acceptTransfer(transferId, useMockData);
        // Transfer accepted: add incoming items to the destination (current) company's stock.
        // Source company's reserved is not updated here — it refreshes on next TilesScreen visit.
        if (companyId && transfer) {
          adjustStock(
            companyId,
            transfer.items.map((i) => ({
              article_code: i.article_code,
              quantity_delta: i.quantity,
            })),
          );
        }
        setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
      } catch (_e) {
        // show error
      } finally {
        if (mountedRef.current) setAcceptRejectLoading(null);
      }
    },
    [companyId, useMockData, pendingTransfers, adjustStock],
  );

  const handleReject = useCallback(
    async (transferId: string) => {
      setAcceptRejectLoading(transferId);
      try {
        await rejectTransfer(transferId, useMockData);
        setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
      } catch (_e) {
        // show error
      } finally {
        if (mountedRef.current) setAcceptRejectLoading(null);
      }
    },
    [useMockData],
  );

  const handleCancel = useCallback(
    async (transferId: string) => {
      setAcceptRejectLoading(transferId);
      try {
        const transfer = pendingTransfers.find((t) => t.id === transferId);
        await cancelTransfer(transferId, useMockData);
        // Transfer cancelled: release reserved items for the source company.
        // Only reserved decreases — total stock (quantity) stays the same because
        // available stock is computed via getAvailableStock (quantity - reserved).
        if (companyId && transfer) {
          adjustStock(
            companyId,
            transfer.items.map((i) => ({
              article_code: i.article_code,
              quantity_delta: 0,
              reserved_delta: -i.quantity,
            })),
          );
        }
        setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
      } catch (_e) {
        // error shown via toast
      } finally {
        if (mountedRef.current) setAcceptRejectLoading(null);
      }
    },
    [companyId, useMockData, pendingTransfers, adjustStock],
  );

  const destinationCompany = transferableCompanies.find((c) => c.id === destinationCompanyId);
  const canInitiate =
    !!userId &&
    !!destinationCompanyId &&
    transferItems.length > 0 &&
    transferItems.every((i) => i.quantity >= 1);

  const renderCreateTab = () => (
    <>
      <View style={styles.section}>
        <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>{Strings.company.destination}</ThemedText>
        <Pressable
          onPress={() => setCompanyPickerVisible(true)}
          style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.icon + '30' }]}
        >
          <ThemedText numberOfLines={1} style={styles.dropdownText}>
            {destinationCompany ? destinationCompany.name : Strings.common.selectCompany}
          </ThemedText>
          <IconSymbol name="chevron.down" size={18} color={colors.icon} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={() => setAddItemModalVisible(true)}
          style={[styles.addItemBtn, { backgroundColor: colors.tint }]}
        >
          <IconSymbol name="plus.circle.fill" size={22} color="#fff" />
          <ThemedText style={styles.addItemBtnText}>{Strings.common.addItem}</ThemedText>
        </Pressable>
      </View>

      {transferItems.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="shippingbox" size={48} color={colors.icon + '50'} />
          <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
            {Strings.company.noItemsTapToAdd}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={transferItems}
          keyExtractor={(item) => item.product.article_code}
          renderItem={({ item }) => {
            const max = Math.max(1, item.product.quantity ?? 1);
            return (
              <View style={[styles.transferCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
                <View style={styles.transferCardBody}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>{item.product.name}</ThemedText>
                  <ThemedText style={[styles.skuText, { color: colors.icon }]}>
                    Code: {item.product.scan_code} · Max: {max}
                  </ThemedText>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => updateTransferQuantity(item.product.article_code, -1)}
                    style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
                  >
                    <IconSymbol name="minus" size={16} color={colors.text} />
                  </Pressable>
                  <TextInput
                    style={[styles.qtyInput, { color: colors.text, borderColor: colors.icon + '30' }]}
                    value={String(item.quantity)}
                    keyboardType="number-pad"
                    onChangeText={(t) => setTransferQuantity(item.product.article_code, t)}
                  />
                  <Pressable
                    onPress={() => updateTransferQuantity(item.product.article_code, 1)}
                    style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
                  >
                    <IconSymbol name="plus" size={16} color={colors.text} />
                  </Pressable>
                </View>
                <Pressable onPress={() => removeTransferItem(item.product.article_code)} hitSlop={8}>
                  <IconSymbol name="trash" size={18} color="#C62828" />
                </Pressable>
              </View>
            );
          }}
          contentContainerStyle={[styles.transferList, { paddingBottom: 100 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {transferItems.length > 0 && (
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
          <Pressable
            onPress={handleInitiateTransfer}
            disabled={!canInitiate || submitting}
            style={[styles.initiateBtn, { backgroundColor: canInitiate && !submitting ? colors.tint : colors.icon + '40' }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <ThemedText style={styles.initiateBtnText}>{Strings.company.initiateTransfer}</ThemedText>
                <IconSymbol name="arrow.right" size={18} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      )}
    </>
  );

  const renderRequestsTab = () => {
    if (loadingPending) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      );
    }
    if (pendingTransfers.length === 0) {
      return (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>{Strings.company.noPendingRequests}</ThemedText>
        </View>
      );
    }
    return (
      <FlatList
        data={pendingTransfers}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => {
          const s = STATUS_STYLE[item.status];
          const loading = acceptRejectLoading === item.id;
          const isOutgoing = item.source_company_id === companyId;
          return (
            <Pressable
              onPress={() => setDetailTransfer(item)}
              style={({ pressed }) => [
                styles.requestCard,
                { backgroundColor: colors.background, borderColor: colors.icon + '25' },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={styles.requestCardTop}>
                <ThemedText type="defaultSemiBold">
                  {isOutgoing ? `To: ${item.destination_company_name}` : `From: ${item.source_company_name}`}
                </ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                  <IconSymbol name={s.icon} size={12} color={s.fg} />
                  <ThemedText style={[styles.statusText, { color: s.fg }]}>{item.status}</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.dateText, { color: colors.icon }]}>
                {formatDate(item.created_at)} · {item.items.length} item(s)
              </ThemedText>
              <View style={styles.requestActions}>
                {isOutgoing ? (
                  <Pressable
                    onPress={() => handleCancel(item.id)}
                    disabled={loading}
                    style={[styles.cancelBtn, { backgroundColor: '#C62828' }]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.actionBtnText}>Cancel</ThemedText>
                    )}
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      onPress={() => handleAccept(item.id)}
                      disabled={loading}
                      style={[styles.acceptBtn, { backgroundColor: '#2E7D32' }]}
                    >
                      {loading ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.actionBtnText}>Accept</ThemedText>}
                    </Pressable>
                    <Pressable
                      onPress={() => handleReject(item.id)}
                      disabled={loading}
                      style={[styles.rejectBtn, { borderColor: '#C62828' }]}
                    >
                      <ThemedText style={[styles.actionBtnTextSecondary, { color: '#C62828' }]}>Reject</ThemedText>
                    </Pressable>
                  </>
                )}
              </View>
            </Pressable>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderHistoryTab = () => {
    if (loadingHistory) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      );
    }
    if (historyTransfers.length === 0) {
      return (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>{Strings.company.noTransferHistory}</ThemedText>
        </View>
      );
    }
    return (
      <FlatList
        data={historyTransfers}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => {
          const s = STATUS_STYLE[item.status];
          const isOutgoing = item.source_company_id === companyId;
          return (
            <Pressable
              onPress={() => setDetailTransfer(item)}
              style={({ pressed }) => [
                styles.historyCard,
                { backgroundColor: colors.background, borderColor: colors.icon + '25' },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={styles.historyCardTop}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {isOutgoing ? `To: ${item.destination_company_name}` : `From: ${item.source_company_name}`}
                </ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                  <IconSymbol name={s.icon} size={12} color={s.fg} />
                  <ThemedText style={[styles.statusText, { color: s.fg }]}>{item.status}</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.dateText, { color: colors.icon }]}>
                {formatDate(item.created_at)} · {item.items.length} item(s)
              </ThemedText>
            </Pressable>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: Strings.company.inventoryTransfer }} />

      <View style={[styles.tabBar, { borderBottomColor: colors.icon + '20' }]}>
        {TABS.map((tab) => {
          const active = activeTab === tab.index;
          return (
            <Pressable
              key={tab.index}
              onPress={() => setActiveTab(tab.index)}
              style={[styles.tab, active && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
            >
              <ThemedText
                style={[styles.tabLabel, active ? { color: colors.tint, fontWeight: '600' } : { color: colors.icon }]}
                numberOfLines={1}
              >
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tabContent}>
        {activeTab === 0 && renderCreateTab()}
        {activeTab === 1 && renderRequestsTab()}
        {activeTab === 2 && renderHistoryTab()}
      </View>

      <Modal visible={addItemModalVisible} animationType="slide" onRequestClose={() => setAddItemModalVisible(false)}>
        <ThemedView style={[styles.modalFull, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText type="subtitle">{Strings.company.selectProduct}</ThemedText>
            <Pressable onPress={() => setAddItemModalVisible(false)} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ProductSearchList companyId={companyId} onSelectProduct={handleSelectProduct} showQuantity />
        </ThemedView>
      </Modal>

      <Modal visible={companyPickerVisible} animationType="slide" onRequestClose={() => setCompanyPickerVisible(false)}>
        <ThemedView style={[styles.modalFull, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText type="subtitle">{Strings.company.destinationCompany}</ThemedText>
            <Pressable onPress={() => setCompanyPickerVisible(false)} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={transferableCompanies}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setDestinationCompanyId(item.id);
                  setCompanyPickerVisible(false);
                }}
                style={[styles.companyRow, { borderBottomColor: colors.icon + '15' }]}
              >
                <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                <IconSymbol name="chevron.right" size={18} color={colors.icon} />
              </Pressable>
            )}
            contentContainerStyle={styles.companyList}
          />
        </ThemedView>
      </Modal>

      <Modal visible={detailTransfer !== null} animationType="slide" onRequestClose={() => setDetailTransfer(null)}>
        {detailTransfer && (() => {
          const dt = detailTransfer;
          const s = STATUS_STYLE[dt.status];
          const isOutgoing = dt.source_company_id === companyId;
          return (
            <ThemedView style={[styles.modalFull, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '20' }]}>
                <ThemedText type="subtitle">Transfer Details</ThemedText>
                <Pressable onPress={() => setDetailTransfer(null)} hitSlop={12}>
                  <IconSymbol name="xmark" size={22} color={colors.text} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailRow}>
                  <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>From</ThemedText>
                  <ThemedText type="defaultSemiBold">{dt.source_company_name ?? dt.source_company_id}</ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>To</ThemedText>
                  <ThemedText type="defaultSemiBold">{dt.destination_company_name ?? dt.destination_company_id}</ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>Status</ThemedText>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <IconSymbol name={s.icon} size={12} color={s.fg} />
                    <ThemedText style={[styles.statusText, { color: s.fg }]}>{dt.status}</ThemedText>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>Date</ThemedText>
                  <ThemedText>{formatDate(dt.created_at)}</ThemedText>
                </View>
                {dt.created_by_user?.display_name && (
                  <View style={styles.detailRow}>
                    <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>Created by</ThemedText>
                    <ThemedText>{dt.created_by_user.display_name}</ThemedText>
                  </View>
                )}
                {dt.notes && (
                  <View style={styles.detailRow}>
                    <ThemedText style={[styles.detailLabel, { color: colors.icon }]}>Notes</ThemedText>
                    <ThemedText style={styles.detailNotes}>{dt.notes}</ThemedText>
                  </View>
                )}

                <View style={[styles.detailDivider, { backgroundColor: colors.icon + '20' }]} />

                <ThemedText type="defaultSemiBold" style={styles.detailItemsTitle}>
                  Items ({dt.items.length})
                </ThemedText>
                {dt.items.map((ti, idx) => (
                  <View
                    key={ti.article_code + idx}
                    style={[styles.detailItemCard, { backgroundColor: colors.icon + '08', borderColor: colors.icon + '20' }]}
                  >
                    <View style={styles.detailItemBody}>
                      <ThemedText type="defaultSemiBold" numberOfLines={1}>
                        {ti.product_name ?? ti.article_code}
                      </ThemedText>
                      {ti.product_name && (
                        <ThemedText style={[styles.detailItemCode, { color: colors.icon }]}>
                          Code: {ti.article_code}
                        </ThemedText>
                      )}
                    </View>
                    <View style={[styles.detailQtyBadge, { backgroundColor: colors.tint + '15' }]}>
                      <ThemedText style={[styles.detailQtyText, { color: colors.tint }]}>
                        x{ti.quantity}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </ThemedView>
          );
        })()}
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: { fontSize: 14 },
  tabContent: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  dropdownText: { flex: 1, fontSize: 16 },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
  },
  addItemBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { textAlign: 'center' },
  transferList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  separator: { height: 10 },
  transferCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  transferCardBody: { flex: 1, gap: 2 },
  skuText: { fontSize: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    width: 48,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  initiateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  initiateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  requestCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    gap: 10,
  },
  requestCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  dateText: { fontSize: 13 },
  requestActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  acceptBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  rejectBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 2 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionBtnTextSecondary: { fontWeight: '600', fontSize: 14 },
  historyCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    gap: 6,
  },
  historyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listContent: { paddingTop: 16, paddingBottom: 24 },
  modalFull: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  companyList: { paddingBottom: 24 },
  detailContent: { padding: 20, paddingBottom: 40 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailLabel: { fontSize: 14 },
  detailNotes: { flex: 1, textAlign: 'right', marginLeft: 16 },
  detailDivider: { height: 1, marginVertical: 16 },
  detailItemsTitle: { marginBottom: 12 },
  detailItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  detailItemBody: { flex: 1, gap: 2 },
  detailItemCode: { fontSize: 12 },
  detailQtyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  detailQtyText: { fontSize: 14, fontWeight: '700' },
});
