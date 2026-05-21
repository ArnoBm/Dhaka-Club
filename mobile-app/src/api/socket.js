import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { getApiBaseURL } from './axios';

let socket = null;

function getSocketURL() {
  return getApiBaseURL().replace(/\/api\/?$/, '');
}

export async function getMemberSocket() {
  const token = await AsyncStorage.getItem('memberToken');

  if (!token) {
    return null;
  }

  if (socket?.connected || socket?.active) {
    return socket;
  }

  socket = io(getSocketURL(), {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectMemberSocket() {
  socket?.disconnect();
  socket = null;
}
