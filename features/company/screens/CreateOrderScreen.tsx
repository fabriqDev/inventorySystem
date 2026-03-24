import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddReturnItemModal } from '@/core/components/add-return-item-modal';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { OrderItemRequestField } from '@/core/types/requested-orders';
import { Colors } from '@/core/constants/theme';
import { useCart } from '@/core/context/cart-context';
import { useLocalOrderDrafts } from '@/core/context/local-order-drafts-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatPrice, roundMoney } from '@/core/services/format';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import type { CartItem, CartTransactionType } from '@/core/types/cart';
import {
  draftItemLineCount,
  draftTotal,
  LOCAL_ORDER_DRAFTS_MAX,
  type LocalOrderDraft,
} from '@/core/types/local-order-draft';

const REQUEST_PURPLE = '#7B2FBE';

/** UI placeholders aligned with `OrderItemRequestField` / `order_item_requests` columns. */
const REQUEST_ITEM_FORM_PLACEHOLDER = {
  [OrderItemRequestField.STUDENT_NAME]: Strings.company.requestItemStudentNameRequired,
  [OrderItemRequestField.STUDENT_CLASS]: Strings.company.requestItemStudentClassRequired,
  [OrderItemRequestField.PHONE_NUMBER]: Strings.company.requestItemPhoneOptional,
} as const;

function formatDraftAge(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return Strings.company.localDraftJustNow;
  if (s < 3600) {
    return Strings.company.localDraftMinutesAgo.replace('{n}', String(Math.floor(s / 60)));
  }
  if (s < 86400) {
    return Strings.company.localDraftHoursAgo.replace('{n}', String(Math.floor(s / 3600)));
  }
  return Strings.company.localDraftDaysAgo.replace('{n}', String(Math.floor(s / 86400)));
}

export default function CreateOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const { items, removeItem, updateQuantity, total, currency, itemCount, clearCart, replaceCart } = useCart();
  const { drafts, saveDraft, deleteDraft, takeDraft } = useLocalOrderDrafts();

  const [addReturnVisible, setAddReturnVisible] = useState(false);
  const [draftsModalVisible, setDraftsModalVisible] = useState(false);
  /** When set, show in-modal replace confirmation (Alert is unreliable on web). */
  const [replaceDraftId, setReplaceDraftId] = useState<string | null>(null);
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null);
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

  const applyDraftToCart = useCallback(
    async (draftId: string) => {
      const d = await takeDraft(draftId);
      if (!d) return;
      replaceCart(d.items);
      setChildName(d.requestMeta.childName);
      setChildClass(d.requestMeta.childClass);
      setParentPhone(d.requestMeta.parentPhone);
      setDraftsModalVisible(false);
    },
    [takeDraft, replaceCart],
  );

  const onContinueDraft = useCallback(
    (draftId: string) => {
      setDeleteDraftId(null);
      if (items.length > 0) {
        setReplaceDraftId(draftId);
        return;
      }
      void applyDraftToCart(draftId);
    },
    [items.length, applyDraftToCart],
  );

  const confirmReplaceDraft = useCallback(() => {
    if (!replaceDraftId) return;
    const id = replaceDraftId;
    setReplaceDraftId(null);
    void applyDraftToCart(id);
  }, [replaceDraftId, applyDraftToCart]);

  const closeDraftsModal = useCallback(() => {
    setReplaceDraftId(null);
    setDeleteDraftId(null);
    setDraftsModalVisible(false);
  }, []);

  const onDeleteDraft = useCallback((draftId: string) => {
    setReplaceDraftId(null);
    setDeleteDraftId(draftId);
  }, []);

  const confirmDeleteDraft = useCallback(() => {
    if (!deleteDraftId) return;
    const id = deleteDraftId;
    setDeleteDraftId(null);
    void deleteDraft(id);
  }, [deleteDraftId, deleteDraft]);

  const onSaveAndNew = useCallback(async () => {
    if (items.length === 0) {
      toast.show({ type: 'info', message: Strings.company.localDraftsNothingToSave });
      return;
    }
    if (drafts.length >= LOCAL_ORDER_DRAFTS_MAX) {
      toast.show({ type: 'info', message: Strings.company.localDraftsMaxReached });
      return;
    }
    const ok = await saveDraft({
      companyId: typeof id === 'string' ? id : '',
      items,
      requestMeta: {
        childName: childName.trim(),
        childClass: childClass.trim(),
        parentPhone: parentPhone.trim(),
      },
    });
    if (!ok) {
      toast.show({ type: 'info', message: Strings.company.localDraftsMaxReached });
      return;
    }
    clearCart();
    setChildName('');
    setChildClass('');
    setParentPhone('');
    toast.show({ type: 'success', message: Strings.company.localDraftSavedToast });
  }, [items, drafts.length, saveDraft, id, childName, childClass, parentPhone, clearCart]);

  const draftSummaryLine = useCallback((d: LocalOrderDraft) => {
    const c = draftItemLineCount(d.items);
    const t = draftTotal(d.items);
    const cur = d.items[0]?.currency ?? currency;
    return Strings.company.localDraftSummaryLine
      .replace('{count}', String(c))
      .replace('{total}', formatPrice(t, cur));
  }, [currency]);

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
            </View>
            <View style={styles.articleMetaCol}>
              {item.product.size ? (
                <ThemedText type="default" style={[styles.articleMetaSize, { color: colors.text }]}>
                  {Strings.company.size}: {item.product.size}
                </ThemedText>
              ) : null}
              <ThemedText style={[styles.articleMetaCode, { color: colors.icon }]}>
                {Strings.company.articleCode}: {item.article_code}
              </ThemedText>
            </View>
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
          <View style={styles.priceAndBadgeCol}>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.subtotal, isRefund && styles.subtotalReturn]}
            >
              {isRefund ? '-' : ''}{formatPrice(Math.abs(lineTotal), item.currency)}
            </ThemedText>
            {isRefund && (
              <View style={[styles.badge, styles.badgeBelowPrice, { backgroundColor: '#FFEBEE' }]}>
                <ThemedText style={[styles.badgeText, { color: '#C62828' }]}>{Strings.company.refund}</ThemedText>
              </View>
            )}
            {isRequest && (
              <View style={[styles.badge, styles.badgeBelowPrice, { backgroundColor: '#EDE7F6' }]}>
                <ThemedText style={[styles.badgeText, { color: REQUEST_PURPLE }]}>
                  {Strings.company.requestBadge}
                </ThemedText>
              </View>
            )}
          </View>
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
      <Stack.Screen
        options={{
          title: Strings.company.createOrder,
          headerRight: () => (
            <View style={styles.headerDraftsRow}>
              <Pressable
                onPress={() => void onSaveAndNew()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={Strings.company.createAnotherOrderA11y}
              >
                <ThemedText style={[styles.headerDraftBtn, { color: colors.tint }]}>
                  {Strings.company.createAnotherOrderHeader}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setDraftsModalVisible(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={Strings.company.viewLocalOrdersA11y}
                style={[styles.headerSavedBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={styles.headerSavedBtnText}>
                  {Strings.company.viewLocalOrdersHeader}
                </ThemedText>
                {drafts.length > 0 ? <View style={styles.headerSavedBadgeDot} /> : null}
              </Pressable>
            </View>
          ),
        }}
      />

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
              placeholder={REQUEST_ITEM_FORM_PLACEHOLDER[OrderItemRequestField.STUDENT_NAME]}
              placeholderTextColor={colors.icon}
              value={childName}
              onChangeText={setChildName}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.metaInput, { borderColor: colors.icon + '30', color: colors.text, backgroundColor: colors.background }]}
              placeholder={REQUEST_ITEM_FORM_PLACEHOLDER[OrderItemRequestField.STUDENT_CLASS]}
              placeholderTextColor={colors.icon}
              value={childClass}
              onChangeText={setChildClass}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.metaInput, { borderColor: colors.icon + '30', color: colors.text, backgroundColor: colors.background }]}
              placeholder={REQUEST_ITEM_FORM_PLACEHOLDER[OrderItemRequestField.PHONE_NUMBER]}
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

      <Modal
        visible={draftsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeDraftsModal}
      >
        <View style={styles.draftsPopupRoot}>
          <Pressable style={styles.draftsModalOverlay} onPress={closeDraftsModal} />
          <ThemedView
            style={[
              styles.draftsPopupCard,
              {
                borderColor: colors.icon + '22',
                paddingBottom: 16 + insets.bottom,
              },
            ]}
          >
            <View style={[styles.draftsModalHeader, { borderBottomColor: colors.icon + '25' }]}>
              <ThemedText type="subtitle" style={styles.draftsModalTitle}>
                {Strings.company.localDraftsModalTitle}
              </ThemedText>
              <Pressable onPress={closeDraftsModal} hitSlop={12} style={styles.draftsModalClose}>
                <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>{Strings.common.done}</ThemedText>
              </Pressable>
            </View>
            <ScrollView
              style={styles.draftsModalScroll}
              contentContainerStyle={styles.draftsModalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {drafts.length === 0 ? (
                <ThemedText style={[styles.draftsEmpty, { color: colors.icon }]}>
                  {Strings.company.localDraftsEmpty}
                </ThemedText>
              ) : (
                drafts.map((d) => (
                  <View
                    key={d.id}
                    style={[styles.draftRow, { borderColor: colors.icon + '22', backgroundColor: colors.background }]}
                  >
                    <View style={styles.draftRowTextCol}>
                      <ThemedText type="defaultSemiBold" numberOfLines={2}>
                        {draftSummaryLine(d)}
                      </ThemedText>
                      <ThemedText style={[styles.draftRowAge, { color: colors.icon }]}>
                        {formatDraftAge(d.updatedAt)}
                      </ThemedText>
                    </View>
                    <View style={styles.draftRowActions}>
                      <Pressable
                        onPress={() => onContinueDraft(d.id)}
                        style={[styles.draftRowBtn, { backgroundColor: colors.tint }]}
                      >
                        <ThemedText style={styles.draftRowBtnText}>{Strings.company.localDraftContinue}</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => onDeleteDraft(d.id)}
                        style={[styles.draftRowBtn, { borderWidth: 1, borderColor: '#C62828', backgroundColor: '#FFEBEE' }]}
                      >
                        <ThemedText style={[styles.draftRowBtnText, { color: '#C62828' }]}>
                          {Strings.company.localDraftDelete}
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {replaceDraftId != null ? (
              <View style={[styles.replaceConfirmScrim, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                <ThemedView
                  style={[styles.replaceConfirmCard, { borderColor: colors.icon + '22', backgroundColor: colors.background }]}
                >
                  <ThemedText type="defaultSemiBold" style={styles.replaceConfirmTitle}>
                    {Strings.company.localDraftReplaceTitle}
                  </ThemedText>
                  <ThemedText style={[styles.replaceConfirmBody, { color: colors.icon }]}>
                    {Strings.company.localDraftReplaceMessage}
                  </ThemedText>
                  <View style={styles.replaceConfirmActions}>
                    <Pressable
                      onPress={() => setReplaceDraftId(null)}
                      style={[styles.replaceConfirmBtn, { borderColor: colors.icon + '40', borderWidth: 1 }]}
                    >
                      <ThemedText style={{ fontWeight: '600', color: colors.text }}>{Strings.common.cancel}</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={confirmReplaceDraft}
                      style={[styles.replaceConfirmBtn, { backgroundColor: colors.tint }]}
                    >
                      <ThemedText style={{ fontWeight: '600', color: '#fff' }}>
                        {Strings.company.localDraftReplaceConfirm}
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              </View>
            ) : deleteDraftId != null ? (
              <View style={[styles.replaceConfirmScrim, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                <ThemedView
                  style={[styles.replaceConfirmCard, { borderColor: colors.icon + '22', backgroundColor: colors.background }]}
                >
                  <ThemedText type="defaultSemiBold" style={styles.replaceConfirmTitle}>
                    {Strings.company.localDraftDeleteConfirmTitle}
                  </ThemedText>
                  <ThemedText style={[styles.replaceConfirmBody, { color: colors.icon }]}>
                    {Strings.company.localDraftDeleteConfirmMessage}
                  </ThemedText>
                  <View style={styles.replaceConfirmActions}>
                    <Pressable
                      onPress={() => setDeleteDraftId(null)}
                      style={[styles.replaceConfirmBtn, { borderColor: colors.icon + '40', borderWidth: 1 }]}
                    >
                      <ThemedText style={{ fontWeight: '600', color: colors.text }}>{Strings.common.cancel}</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={confirmDeleteDraft}
                      style={[styles.replaceConfirmBtn, { backgroundColor: '#C62828' }]}
                    >
                      <ThemedText style={{ fontWeight: '600', color: '#fff' }}>
                        {Strings.company.localDraftDelete}
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              </View>
            ) : null}
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerDraftsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginRight: 4,
  },
  headerDraftBtn: { fontSize: 13, fontWeight: '600' },
  headerSavedBtn: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    minWidth: 64,
  },
  headerSavedBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerSavedBadgeDot: {
    position: 'absolute',
    top: 2,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C62828',
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  draftsPopupRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  draftsModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  draftsPopupCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  replaceConfirmScrim: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  replaceConfirmCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  replaceConfirmTitle: { fontSize: 17 },
  replaceConfirmBody: { fontSize: 14, lineHeight: 20 },
  replaceConfirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  replaceConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  draftsModalTitle: { flex: 1, paddingRight: 8 },
  draftsModalClose: { paddingVertical: 4, paddingHorizontal: 4 },
  draftsModalScroll: { maxHeight: 420 },
  draftsModalBody: { padding: 16, paddingBottom: 24, gap: 12 },
  draftsEmpty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 24 },
  draftRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  draftRowTextCol: { gap: 4 },
  draftRowAge: { fontSize: 12 },
  draftRowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  draftRowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftRowBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

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
  priceAndBadgeCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    minWidth: 72,
  },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeBelowPrice: { marginTop: 2 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  articleMetaCol: { gap: 4 },
  articleMetaSize: { fontSize: 16, fontWeight: '500' },
  articleMetaCode: { fontSize: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  subtotal: { textAlign: 'right', fontSize: 14 },
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
