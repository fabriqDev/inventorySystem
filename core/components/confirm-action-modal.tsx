import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';

export type ConfirmActionModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Background color for the primary / confirm action button */
  confirmColor: string;
  /** Disables actions and shows a spinner on the confirm button */
  loading?: boolean;
  onConfirm: () => void;
  /**
   * `modal` — own RN Modal (e.g. fulfill flow).
   * `overlay` — absolute fill inside an existing Modal/parent; avoids nested Modals on web (confirm taps would not fire).
   */
  presentation?: 'modal' | 'overlay';
};

/** Centered confirmation dialog (fade + dimmed overlay). Same pattern as fulfill-request on requested-order detail. */
export function ConfirmActionModal({
  visible,
  onClose,
  title,
  message,
  cancelLabel,
  confirmLabel,
  confirmColor,
  loading = false,
  onConfirm,
  presentation = 'modal',
}: ConfirmActionModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (!visible) {
    return null;
  }

  const body = (
    <Pressable style={styles.confirmOverlay} onPress={onClose}>
      <View style={[styles.confirmCard, { backgroundColor: colors.background }]}>
        <ThemedText type="defaultSemiBold" style={[styles.confirmTitle, { color: colors.text }]}>
          {title}
        </ThemedText>
        {message?.trim() ? (
          <ThemedText style={[styles.confirmMessage, { color: colors.icon }]}>{message.trim()}</ThemedText>
        ) : null}
        <View style={styles.confirmActions}>
          <Pressable
            onPress={onClose}
            disabled={loading}
            style={[
              styles.confirmBtn,
              { borderColor: colors.icon + '40', borderWidth: 1 },
              loading && styles.confirmBtnDisabled,
            ]}
          >
            <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{cancelLabel}</ThemedText>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={loading}
            style={[
              styles.confirmBtn,
              { backgroundColor: confirmColor },
              loading && styles.confirmBtnDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{confirmLabel}</ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  if (presentation === 'overlay') {
    return (
      <View style={styles.overlayHost} pointerEvents="box-none">
        {body}
      </View>
    );
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 24,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    borderRadius: 14,
    padding: 24,
    maxWidth: 340,
    width: '100%',
    gap: 16,
  },
  confirmTitle: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  confirmMessage: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', gap: 12 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmBtnDisabled: { opacity: 0.65 },
});
