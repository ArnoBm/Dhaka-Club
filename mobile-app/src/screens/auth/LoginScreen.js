import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import ScreenContainer from '../../components/ScreenContainer';

function LoginScreen() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    if (!phone.trim() || !password) {
      setErrorMessage('Phone number and password are required.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      await login(phone.trim(), password);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        'Unable to sign in. Please check your phone and password.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.loginContent}
      >
        <StatusBar style="light" />

      <LinearGradient
        colors={[colors.midnight, colors.navy, '#20385f']}
        style={styles.backgroundLayer}
      />
      <View style={styles.topGlow} />
      <View style={styles.bottomGlow} />

      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>DC</Text>
        </View>
        <Text style={styles.clubName}>Dhaka Club</Text>
        <Text style={styles.portalText}>Private Member Concierge</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.title}>Sign In</Text>
            <Text style={styles.subtitle}>Access your club account</Text>
          </View>
          <View style={styles.secureIcon}>
            <Ionicons name="shield-checkmark" size={22} color="#047857" />
          </View>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="number-pad"
              placeholder="Enter phone number"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
          </View>

          <View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
              />
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                style={styles.eyeButton}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#64748b"
                />
              </Pressable>
            </View>
          </View>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          <Pressable
            disabled={loading}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </View>

        <Text style={styles.footerNote}>Exclusive access for Dhaka Club members</Text>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.midnight,
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonPressed: {
    backgroundColor: colors.navy,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(248, 213, 126, 0.45)',
    borderWidth: 1,
    borderRadius: 28,
    elevation: 5,
    marginHorizontal: 20,
    marginTop: 28,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  clubName: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 14,
  },
  errorText: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  eyeButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  footerNote: {
    color: '#f6e8c2',
    fontSize: 14,
    marginTop: 22,
    textAlign: 'center',
  },
  form: {
    gap: 16,
    marginTop: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 28,
    zIndex: 1,
  },
  input: {
    backgroundColor: colors.ivory,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    height: 50,
    marginTop: 8,
    paddingHorizontal: 14,
  },
  label: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.champagne,
    borderColor: 'rgba(255,255,255,0.6)',
    borderWidth: 4,
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  logoText: {
    color: colors.midnight,
    fontSize: 24,
    fontWeight: '900',
  },
  loginContent: {
    flex: 1,
    justifyContent: 'center',
  },
  passwordInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 16,
    height: 50,
    paddingLeft: 14,
  },
  passwordWrap: {
    alignItems: 'center',
    backgroundColor: colors.ivory,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 8,
  },
  portalText: {
    color: '#f6e8c2',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  screen: {
    backgroundColor: colors.midnight,
    flex: 1,
  },
  secureIcon: {
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 15,
    marginTop: 6,
  },
  title: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
  topGlow: {
    backgroundColor: '#2563eb',
    borderRadius: 120,
    height: 180,
    opacity: 0.28,
    position: 'absolute',
    right: -80,
    top: -55,
    width: 180,
  },
  bottomGlow: {
    backgroundColor: '#f59e0b',
    borderRadius: 120,
    bottom: -80,
    height: 190,
    left: -70,
    opacity: 0.22,
    position: 'absolute',
    width: 190,
  },
});

export default LoginScreen;
