import axios from 'axios'
import { notifications } from '@mantine/notifications'

export interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

const TOKEN_KEY = 'zd_access_token'

export function getAccessToken(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    const ct = String(response.headers['content-type'] ?? '')
    if (ct.includes('application/json')) {
      const body = response.data as ApiResponse<unknown>
      if (body && typeof body === 'object' && 'code' in body) {
        if (body.code !== 0) {
          notifications.show({
            color: 'red',
            title: '请求失败',
            message: body.msg || '未知错误',
          })
          return Promise.reject(new Error(body.msg))
        }
        response.data = body as typeof response.data
      }
    }
    return response
  },
  (error) => {
    if (error?.response?.status === 401) {
      clearAccessToken()
    }
    const msg =
      error.response?.data?.msg ||
      error.response?.data?.detail ||
      error.message ||
      '网络错误'
    notifications.show({
      color: 'red',
      title: '请求失败',
      message: String(msg),
    })
    return Promise.reject(error)
  },
)

export function unwrap<T>(data: unknown): T {
  const body = data as ApiResponse<T>
  return body.data as T
}
