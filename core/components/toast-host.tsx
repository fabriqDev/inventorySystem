import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { toast, type ToastPayload } from '@/core/services/toast';

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [current, setCurrent] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const unsub = toast.subscribe(setCurrent);
    return () => {
      unsub();
    };
  }, []);

  const ui = useMemo(() => {
    if (!current) return null;
    const bg =
      current.type === 'error'
        ? '#C62828'
        : current.type === 'success'
          ? '#2E7D32'
          : colors.text;
    return { bg };
  }, [current, colors.text]);

  if (!current || !ui) return null;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Pressable
        onPress={() => toast.hide()}
        style={[
          styles.toast,
          { backgroundColor: ui.bg, marginTop: insets.top + 10 },
        ]}
      >
        <ThemedText style={styles.text} numberOfLines={3}>
          {current.message}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 999,
    alignItems: 'center',
  },
  toast: {
    maxWidth: 520,
    width: '92%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
});

