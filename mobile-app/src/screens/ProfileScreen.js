import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import ScreenContainer from '../components/ScreenContainer';

function ProfileScreen() {
  const { member, logout, updateMember } = useAuth();
  const [profile, setProfile] = useState(member);
  const [form, setForm] = useState(toForm(member));
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    setProfile(member);
    setForm(toForm(member));
  }, [member]);

  const fetchProfile = async () => {
    setLoading(true);

    try {
      const response = await api.get('/auth/member-profile');
      setProfile(response.data);
      setForm(toForm(response.data));
      await updateMember(response.data);
    } catch (error) {
      Alert.alert('Failed', 'Unable to load profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow photo access to upload a profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });

    if (!result.canceled && result.assets?.[0]) {
      setSelectedImage(result.assets[0]);
    }
  };

  const saveProfile = async () => {
    if (!form.email.trim()) {
      Alert.alert('Required', 'Email is required.');
      return;
    }

    if (!form.phone.trim()) {
      Alert.alert('Required', 'Primary number is required.');
      return;
    }

    setSaving(true);

    try {
      const payload = new FormData();
      payload.append('email', form.email.trim());
      payload.append('phone', form.phone.trim());
      payload.append('secondary_number', form.secondary_number.trim());
      payload.append('occupation', form.occupation.trim());
      payload.append('address', form.address.trim());

      if (selectedImage) {
        const extension = selectedImage.uri.split('.').pop() || 'jpg';
        payload.append('profile_photo', {
          uri: selectedImage.uri,
          name: `profile-photo.${extension}`,
          type: selectedImage.mimeType || `image/${extension}`,
        });
      }

      const response = await api.put('/auth/member-profile', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updatedMember = response.data.member;

      setProfile(updatedMember);
      setForm(toForm(updatedMember));
      setSelectedImage(null);
      await updateMember(updatedMember);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (error) {
      Alert.alert(
        'Failed',
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Unable to update profile.'
      );
    } finally {
      setSaving(false);
    }
  };

  const updatePasswordField = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const changePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      Alert.alert('Required', 'Please fill all password fields.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must be at least 6 characters.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }

    setPasswordSaving(true);

    try {
      await api.post('/auth/member-change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      Alert.alert('Success', 'Password changed successfully.');
    } catch (error) {
      Alert.alert(
        'Failed',
        error.response?.data?.message ||
          error.response?.data?.error ||
          'Unable to change password.'
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const photoUri = selectedImage?.uri || getPhotoUrl(profile?.profile_photo);

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
        colors={[colors.midnight, colors.navy, '#31435e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pageHero}
      >
        <Text style={styles.heroEyebrow}>Member Identity</Text>
        <Text style={styles.heroTitle}>Profile</Text>
        <Text style={styles.heroSubtitle}>Your Dhaka Club details, contact, and credentials.</Text>
      </LinearGradient>

      <View style={styles.profileCard}>
        <Pressable onPress={pickImage} style={styles.photoButton}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoInitial}>{getInitial(profile?.full_name)}</Text>
            </View>
          )}
          <Text style={styles.photoText}>Update Photo</Text>
        </Pressable>

        <Text style={styles.name}>{profile?.full_name || '-'}</Text>
        <Text style={styles.memberId}>{profile?.member_id || '-'}</Text>

        <View style={styles.readOnlyGrid}>
          <InfoPill label="Type" value={profile?.member_type || '-'} />
          <InfoPill label="Group" value={profile?.membership_group || '-'} />
          <InfoPill label="Blood" value={profile?.blood_group || '-'} />
          <InfoPill label="Expiry" value={formatDate(profile?.membership_expiry)} />
        </View>
      </View>

      <View style={styles.formCard}>
        <InputField label="Email" value={form.email} onChangeText={(value) => updateField('email', value)} keyboardType="email-address" />
        <InputField label="Primary Number" value={form.phone} onChangeText={(value) => updateField('phone', value)} keyboardType="phone-pad" />
        <InputField label="Secondary Number" value={form.secondary_number} onChangeText={(value) => updateField('secondary_number', value)} keyboardType="phone-pad" />
        <InputField label="Current Occupation" value={form.occupation} onChangeText={(value) => updateField('occupation', value)} />
        <InputField label="Current Address" value={form.address} onChangeText={(value) => updateField('address', value)} multiline />

        <Pressable disabled={saving || loading} onPress={saveProfile} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveText}>Save Changes</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Change Password</Text>
        <Text style={styles.cardSubtitle}>
          Default password is 123456. Change it after first login.
        </Text>
        <InputField
          label="Current Password"
          value={passwordForm.currentPassword}
          onChangeText={(value) => updatePasswordField('currentPassword', value)}
          secureTextEntry
        />
        <InputField
          label="New Password"
          value={passwordForm.newPassword}
          onChangeText={(value) => updatePasswordField('newPassword', value)}
          secureTextEntry
        />
        <InputField
          label="Confirm New Password"
          value={passwordForm.confirmPassword}
          onChangeText={(value) => updatePasswordField('confirmPassword', value)}
          secureTextEntry
        />

        <Pressable disabled={passwordSaving} onPress={changePassword} style={styles.passwordButton}>
          {passwordSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveText}>Update Password</Text>
          )}
        </Pressable>
      </View>

      <Pressable onPress={logout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function InputField({ label, multiline, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.textArea]}
        placeholderTextColor="#94a3b8"
      />
    </View>
  );
}

function InfoPill({ label, value }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function toForm(member) {
  return {
    email: member?.email || '',
    phone: member?.phone || '',
    secondary_number: member?.secondary_number || '',
    occupation: member?.occupation || '',
    address: member?.address || '',
  };
}

function getInitial(name) {
  return String(name || 'M').trim().slice(0, 1).toUpperCase();
}

function getPhotoUrl(path) {
  if (!path) {
    return '';
  }

  if (path.startsWith('http')) {
    return path;
  }

  const baseURL = api.defaults.baseURL.replace('/api', '');
  return `${baseURL}${path}`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 88,
  },
  field: {
    marginTop: 14,
  },
  formCard: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    marginTop: 16,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '900',
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoPill: {
    backgroundColor: colors.ivory,
    borderRadius: 12,
    flex: 1,
    minWidth: '46%',
    padding: 12,
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
  },
  input: {
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    marginTop: 16,
  },
  logoutText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '900',
  },
  memberId: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  name: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  photo: {
    borderRadius: 48,
    height: 96,
    width: 96,
  },
  photoButton: {
    alignItems: 'center',
  },
  photoInitial: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
  },
  photoPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  photoText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    marginTop: 18,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  readOnlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.midnight,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    marginTop: 18,
  },
  saveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  passwordButton: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    marginTop: 18,
  },
  screen: {
    backgroundColor: colors.porcelain,
    flex: 1,
  },
  heroEyebrow: {
    color: colors.champagne,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: '#d9e7ff',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 5,
  },
  pageHero: {
    borderRadius: 28,
    padding: 20,
  },
  textArea: {
    minHeight: 96,
  },
  title: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
});

export default ProfileScreen;
