import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

export function getApiBaseURL() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Constants.expoConfig?.extra?.apiUrl) {
    return Constants.expoConfig.extra.apiUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  const host = hostUri?.split(':')[0];

  if (host) {
    return `http://${host}:5000/api`;
  }

  return 'http://192.168.68.70:5000/api';
}

const api = axios.create({
  baseURL: getApiBaseURL(),
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('memberToken');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
