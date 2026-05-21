import { io } from 'socket.io-client'

let socket = null

function getSocketURL() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin

  if (apiBase === '/api') {
    return window.location.origin
  }

  return apiBase.replace(/\/api\/?$/, '')
}

export function getAdminSocket() {
  const token = localStorage.getItem('token')

  if (!token) {
    return null
  }

  if (socket?.connected || socket?.active) {
    return socket
  }

  socket = io(getSocketURL(), {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  })

  return socket
}

export function disconnectAdminSocket() {
  socket?.disconnect()
  socket = null
}
