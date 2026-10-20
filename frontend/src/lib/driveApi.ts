import { api, clearAccessToken, getAccessToken, unwrap } from './api'
import type { AccessLogPage, AdminUser, BreadcrumbItem, Collaborator, DriveNode, FolderTreeItem, ShareLink, ShareLinkPublicInfo, ShareLinkWithNode, SharedFolder } from '../types/node'

export async function fetchRootId(): Promise<string> {
  const res = await api.get('/nodes/root')
  return unwrap<{ id: string }>(res.data).id
}

export async function listChildren(parentId: string): Promise<DriveNode[]> {
  const res = await api.get('/nodes', { params: { parent_id: parentId } })
  return unwrap<DriveNode[]>(res.data)
}

export async function fetchBreadcrumb(nodeId: string): Promise<BreadcrumbItem[]> {
  const res = await api.get(`/nodes/${nodeId}/breadcrumb`)
  return unwrap<BreadcrumbItem[]>(res.data)
}

export async function fetchFolderTree(): Promise<FolderTreeItem[]> {
  const res = await api.get('/nodes/folders/tree')
  return unwrap<FolderTreeItem[]>(res.data)
}

export async function createFolder(
  parentId: string,
  name: string,
): Promise<DriveNode> {
  const res = await api.post('/nodes/folder', { parent_id: parentId, name })
  return unwrap<DriveNode>(res.data)
}

export async function uploadFile(
  parentId: string,
  file: File,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
): Promise<DriveNode> {
  const fd = new FormData()
  fd.append('parent_id', parentId)
  fd.append('file', file)
  const res = await api.post('/nodes/upload', fd, {
    signal,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    },
  })
  return unwrap<DriveNode>(res.data)
}

/** 相对路径，适合当前站点内 <a href> / window.open（会带上 Cookie） */
export function downloadUrl(nodeId: string): string {
  return `/api/nodes/${nodeId}/download`
}

export function thumbnailUrl(nodeId: string, size = 200): string {
  return `/api/nodes/${nodeId}/thumbnail?size=${size}`
}

/** 当前登录会话可直接打开的完整下载 URL。对外分享请使用 absoluteShareDownloadUrl。 */
export function absoluteDownloadUrl(nodeId: string): string {
  if (typeof window === 'undefined') {
    return downloadUrl(nodeId)
  }
  const basePath = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
  const apiPath = downloadUrl(nodeId)
  const fullPath = `${basePath}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
  return new URL(fullPath, window.location.origin).toString()
}

export async function renameNode(nodeId: string, name: string): Promise<DriveNode> {
  const res = await api.patch(`/nodes/${nodeId}/rename`, { name })
  return unwrap<DriveNode>(res.data)
}

export async function moveNode(nodeId: string, parentId: string): Promise<DriveNode> {
  const res = await api.post(`/nodes/${nodeId}/move`, { parent_id: parentId })
  return unwrap<DriveNode>(res.data)
}

export async function deleteNode(nodeId: string): Promise<void> {
  await api.delete(`/nodes/${nodeId}`)
}

export async function reparseNodeMeta(nodeId: string): Promise<DriveNode> {
  const res = await api.post(`/nodes/${nodeId}/reparse-meta`)
  return unwrap<DriveNode>(res.data)
}

export async function register(username: string, password: string): Promise<void> {
  await api.post('/auth/register', { username, password })
}

export async function login(username: string, password: string): Promise<void> {
  await api.post('/auth/login', { username, password })
  // 新会话使用 HttpOnly Cookie；清理旧版 localStorage Token。
  clearAccessToken()
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } finally {
    clearAccessToken()
  }
}

export async function me(): Promise<{ username: string; is_admin: boolean }> {
  const res = await api.get('/auth/me')
  return unwrap<{ username: string; is_admin: boolean }>(res.data)
}

export async function hasActiveSession(): Promise<boolean> {
  const token = getAccessToken()
  const response = await fetch('/api/auth/me', {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return response.ok
}

// Collaborator APIs

export async function listCollaborators(folderId: string): Promise<Collaborator[]> {
  const res = await api.get(`/collaborators/${folderId}`)
  return unwrap<Collaborator[]>(res.data)
}

export async function addCollaborator(
  folderId: string,
  username: string,
  role: string,
): Promise<Collaborator> {
  const res = await api.post(`/collaborators/${folderId}`, { username, role })
  return unwrap<Collaborator>(res.data)
}

export async function updateCollaborator(
  folderId: string,
  targetUserId: string,
  role: string,
): Promise<Collaborator> {
  const res = await api.put(`/collaborators/${folderId}/${targetUserId}`, { role })
  return unwrap<Collaborator>(res.data)
}

export async function removeCollaborator(folderId: string, targetUserId: string): Promise<void> {
  await api.delete(`/collaborators/${folderId}/${targetUserId}`)
}

export async function listSharedWithMe(): Promise<SharedFolder[]> {
  const res = await api.get('/collaborators/with-me/list')
  return unwrap<SharedFolder[]>(res.data)
}

// Search

export async function searchNodes(q: string): Promise<DriveNode[]> {
  if (!q.trim()) return []
  const res = await api.get('/nodes/search', { params: { q } })
  return unwrap<DriveNode[]>(res.data)
}

// Favorites

export async function listFavorites(): Promise<DriveNode[]> {
  const res = await api.get('/favorites')
  return unwrap<DriveNode[]>(res.data)
}

export async function addFavorite(nodeId: string): Promise<void> {
  await api.post(`/favorites/${nodeId}`)
}

export async function removeFavorite(nodeId: string): Promise<void> {
  await api.delete(`/favorites/${nodeId}`)
}

// Copy

export async function copyNode(nodeId: string, targetParentId: string): Promise<DriveNode> {
  const res = await api.post(`/nodes/${nodeId}/copy`, { parent_id: targetParentId })
  return unwrap<DriveNode>(res.data)
}

// Share Links

export async function createShareLink(
  nodeId: string,
  options?: { password?: string; expireInHours?: number; maxAccessCount?: number },
): Promise<ShareLink> {
  const res = await api.post(`/share-links/${nodeId}`, {
    password: options?.password || undefined,
    expire_in_hours: options?.expireInHours || undefined,
    max_access_count: options?.maxAccessCount || undefined,
  })
  return unwrap<ShareLink>(res.data)
}

export async function listShareLinks(nodeId: string): Promise<ShareLink[]> {
  const res = await api.get(`/share-links/${nodeId}`)
  return unwrap<ShareLink[]>(res.data)
}

export async function revokeShareLink(linkId: string): Promise<void> {
  await api.delete(`/share-links/${linkId}`)
}

export async function toggleShareLink(linkId: string): Promise<ShareLink> {
  const res = await api.patch(`/share-links/${linkId}/toggle`)
  return unwrap<ShareLink>(res.data)
}

export async function listAllShareLinks(): Promise<ShareLinkWithNode[]> {
  const res = await api.get('/share-links')
  return unwrap<ShareLinkWithNode[]>(res.data)
}

// Admin

export async function listAdminUsers(): Promise<AdminUser[]> {
  const res = await api.get('/admin/users')
  return unwrap<AdminUser[]>(res.data)
}

export async function updateAdminUser(
  targetId: string,
  data: { is_admin?: boolean; is_active?: boolean },
): Promise<AdminUser> {
  const res = await api.patch(`/admin/users/${targetId}`, data)
  return unwrap<AdminUser>(res.data)
}

export async function deleteAdminUser(targetId: string): Promise<void> {
  await api.delete(`/admin/users/${targetId}`)
}

// Public share — use fetch() to avoid auth interceptor

async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.msg || `请求失败 (${res.status})`)
  }
  const body = await res.json()
  if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
    throw new Error(body.msg || '未知错误')
  }
  return (body as { data: T }).data
}

export async function getPublicShareInfo(token: string): Promise<ShareLinkPublicInfo> {
  return publicFetch<ShareLinkPublicInfo>(`/public/share/${token}`)
}

export async function verifySharePassword(
  token: string,
  password: string,
): Promise<{ valid: boolean; access_token: string }> {
  return publicFetch(`/public/share/${token}/verify`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function shareDownloadUrl(token: string, accessToken?: string): string {
  const base = `/api/public/share/${token}/download`
  if (accessToken) return `${base}?share_token=${encodeURIComponent(accessToken)}`
  return base
}

export function absoluteShareUrl(token: string): string {
  if (typeof window === 'undefined') return `/s/${token}`
  return `${window.location.origin}/s/${token}`
}

export function absoluteShareDownloadUrl(token: string): string {
  const path = `/api/public/share/${token}/download`
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}

export async function listAccessLogs(params?: {
  shareToken?: string
  action?: string
  offset?: number
  limit?: number
  sort?: 'asc' | 'desc'
}): Promise<AccessLogPage> {
  const qs = new URLSearchParams()
  if (params?.shareToken) qs.set('share_token', params.shareToken)
  if (params?.action) qs.set('action', params.action)
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.sort) qs.set('sort', params.sort)
  const res = await api.get(`/access-logs?${qs.toString()}`)
  return unwrap<AccessLogPage>(res.data)
}

export async function leaveSharedFolder(folderId: string): Promise<void> {
  await api.delete(`/collaborators/${folderId}/leave`)
}

export async function joinShareFolder(
  token: string,
  shareToken?: string,
): Promise<{ node_id: string }> {
  const qs = shareToken ? `?share_token=${encodeURIComponent(shareToken)}` : ''
  const res = await api.post(`/share-links/join/${token}${qs}`)
  return unwrap<{ node_id: string }>(res.data)
}
