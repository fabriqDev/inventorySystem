import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { useAuth } from '@/core/context/auth-context';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { Strings } from '@/core/strings';

const SUCCESS_DURATION = 1500;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const colors = Colors[colorScheme ?? 'light'];

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError(Strings.auth.pleaseEnterEmailPassword);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        const msg = signInError.message.toLowerCase().includes('network')
          ? Strings.auth.networkError
          : signInError.message;
        setError(msg);
      } else {
        setShowSuccess(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : Strings.auth.somethingWentWrong;
      setError(msg.toLowerCase().includes('network') ? Strings.auth.networkError : msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showSuccess) {
      successScale.setValue(0);
      successOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 100,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const t = setTimeout(() => {
        router.replace('/(tabs)');
      }, SUCCESS_DURATION);
      return () => clearTimeout(t);
    }
  }, [showSuccess, successScale, successOpacity, router]);

  const keyboardBehavior = Platform.OS === 'ios' ? 'padding' : 'height';

  const successPop = showSuccess && (
    <Animated.View
      style={[styles.popupOverlay, { opacity: successOpacity }]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.popup,
          { backgroundColor: colors.background, borderColor: colors.icon },
          { transform: [{ scale: successScale }] },
          Platform.OS === 'web' && styles.popupWeb,
        ]}
      >
        <View style={[styles.popupIconWrap, { backgroundColor: colors.tint }]}>
          <MaterialIcons name="check" size={40} color="#fff" />
        </View>
        <ThemedText type="subtitle" style={styles.popupText}>
          {Strings.auth.loginSuccess}
        </ThemedText>
      </Animated.View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={keyboardBehavior}
      >
        <ThemedView style={styles.container}>
          <ThemedView style={[styles.card, Platform.OS === 'web' && styles.cardWeb]}>
            <ThemedText type="title" style={styles.title}>
              {Strings.app.name}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.subtitle}>
              {Strings.auth.signIn}
            </ThemedText>

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.icon }]}
              placeholder={Strings.auth.email}
              placeholderTextColor={colors.icon}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput, { color: colors.text, borderColor: colors.icon }]}
                placeholder={Strings.auth.password}
                placeholderTextColor={colors.icon}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable
                onPress={() => setShowPassword((p) => !p)}
                style={[styles.eyeButton, Platform.OS === 'web' && styles.eyeButtonWeb]}
                hitSlop={12}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={24}
                  color={colors.icon}
                />
              </Pressable>
            </View>

            {error ? (
              <ThemedText style={styles.error}>{error}</ThemedText>
            ) : null}

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
                Platform.OS === 'web' && styles.buttonWeb,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText lightColor="#fff" darkColor="#111" style={styles.buttonText}>
                  {Strings.auth.login}
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        </ThemedView>
      </KeyboardAvoidingView>
      {successPop}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
    gap: 16,
  },
  cardWeb: {
    maxWidth: 400,
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  title: {
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    minHeight: 48,
  },
  passwordWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  eyeButtonWeb: {
    cursor: 'pointer' as const,
  },
  popupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  popup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 280,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  popupWeb: {
    cursor: 'default' as const,
  },
  popupIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupText: {
    flex: 1,
    fontSize: 18,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonWeb: {
    cursor: 'pointer' as const,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
  },
});
