import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { disconnectMemberSocket } from '../api/socket';
import { registerForPushNotifications, unregisterPushNotifications } from '../utils/notifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('memberToken');
        const storedMember = await AsyncStorage.getItem('memberInfo');

        if (storedToken && storedMember) {
          setToken(storedToken);
          setMember(JSON.parse(storedMember));
          registerForPushNotifications().catch(() => {});
        }
      } catch (error) {
        await AsyncStorage.multiRemove(['memberToken', 'memberInfo']);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (phone, password) => {
    const response = await api.post('/auth/member-login', { phone, password });
    const { token: memberToken, member: memberInfo } = response.data;

    await AsyncStorage.setItem('memberToken', memberToken);
    await AsyncStorage.setItem('memberInfo', JSON.stringify(memberInfo));

    setToken(memberToken);
    setMember(memberInfo);
    registerForPushNotifications().catch(() => {});

    return memberInfo;
  };

  const logout = async () => {
    await unregisterPushNotifications();
    disconnectMemberSocket();
    await AsyncStorage.clear();
    setToken(null);
    setMember(null);
  };

  const updateMember = async (memberInfo) => {
    await AsyncStorage.setItem('memberInfo', JSON.stringify(memberInfo));
    setMember(memberInfo);
  };

  const value = useMemo(
    () => ({
      member,
      token,
      loading,
      login,
      logout,
      updateMember,
    }),
    [member, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
