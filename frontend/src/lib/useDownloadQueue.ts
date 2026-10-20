import { useCallback, useEffect, useRef, useState } from 'react'
import { notifications } from '@mantine/notifications'

import { getAccessToken } from './api'
import * as driveApi from './driveApi'
import type { DownloadManifestItem } from '../types/node'

export type DownloadStatus = 'queued' | 'downloading' | 'success' | 'failed' | 'cancelled'

export interface DownloadItem {
  id: string
  nodeId: string
  name: string
  path: string
  size: number
  loaded: number
  progress: number
  status: DownloadStatus
  error?: string
}

interface DownloadTask extends DownloadItem {
  directoryHandle: FileSystemDirectoryHandle | null
  controller: AbortController | null
}

function toDownloadItem(task: DownloadTask): DownloadItem {
  return {
    id: task.id,
    nodeId: task.nodeId,
    name: task.name,
    path: task.path,
    size: task.size,
    loaded: task.loaded,
    progress: task.progress,
    status: task.status,
    error: task.error,
  }
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? 'download'
}

function numberedName(name: string, number: number): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name} (${number})`
  return `${name.slice(0, dot)} (${number})${name.slice(dot)}`
}

async function createUniqueFile(
  directory: FileSystemDirectoryHandle,
  requestedName: string,
): Promise<{ handle: FileSystemFileHandle; name: string }> {
  for (let number = 1; number < 10_000; number += 1) {
    const name = number === 1 ? requestedName : numberedName(requestedName, number)
    try {
      await directory.getFileHandle(name)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return { handle: await directory.getFileHandle(name, { create: true }), name }
      }
      if (error instanceof DOMException && error.name === 'TypeMismatchError') continue
      throw error
    }
  }
  throw new Error(`无法为 ${requestedName} 生成可用文件名`)
}

async function resolveTarget(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<{ directory: FileSystemDirectoryHandle; file: FileSystemFileHandle; name: string }> {
  const segments = path.split('/').filter(Boolean)
  const requestedName = segments.pop() ?? 'download'
  let directory = root
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create: true })
  }
  const target = await createUniqueFile(directory, requestedName)
  return { directory, file: target.handle, name: target.name }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string; msg?: string }
    return body.detail || body.msg || `下载失败（HTTP ${response.status}）`
  } catch {
    return `下载失败（HTTP ${response.status}）`
  }
}

export function useDownloadQueue() {
  const [items, setItems] = useState<DownloadItem[]>([])
  const tasksRef = useRef(new Map<string, DownloadTask>())
  const orderRef = useRef<string[]>([])
  const activeIdRef = useRef<string | null>(null)
  const pumpRef = useRef<() => void>(() => undefined)

  const syncItems = useCallback(() => {
    setItems(
      orderRef.current
        .map((id) => tasksRef.current.get(id))
        .filter((task): task is DownloadTask => task !== undefined)
        .map(toDownloadItem),
    )
  }, [])

  const runTask = useCallback(async (task: DownloadTask) => {
    const controller = new AbortController()
    task.controller = controller
    task.status = 'downloading'
    task.error = undefined
    syncItems()

    const headers = new Headers()
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    let loaded = 0
    let lastRenderedAt = 0
    let writable: FileSystemWritableFileStream | null = null
    let createdDirectory: FileSystemDirectoryHandle | null = null
    let createdName = ''
    const chunks: BlobPart[] = []

    try {
      const response = await fetch(driveApi.downloadUrl(task.nodeId), {
        credentials: 'include',
        headers,
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(await responseError(response))
      if (!response.body) throw new Error('浏览器无法读取下载流')

      const total = Number(response.headers.get('content-length')) || task.size
      const reader = response.body.getReader()
      if (task.directoryHandle) {
        const target = await resolveTarget(task.directoryHandle, task.path)
        createdDirectory = target.directory
        createdName = target.name
        writable = await target.file.createWritable()
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (writable) await writable.write(value)
        else chunks.push(value.slice())
        loaded += value.byteLength

        const now = performance.now()
        if (now - lastRenderedAt >= 100) {
          task.loaded = loaded
          task.progress = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0
          lastRenderedAt = now
          syncItems()
        }
      }

      if (writable) await writable.close()
      else triggerBlobDownload(new Blob(chunks), basename(task.path))
      task.loaded = loaded
      task.progress = 100
      task.status = 'success'
    } catch (error) {
      if (writable) {
        try {
          await writable.abort()
        } catch {
          // 浏览器可能已因网络错误关闭写入流。
        }
      }
      if (createdDirectory && createdName) {
        try {
          await createdDirectory.removeEntry(createdName)
        } catch {
          // 清理失败时保留浏览器创建的临时文件。
        }
      }
      if (controller.signal.aborted) {
        task.status = 'cancelled'
        task.error = '已取消'
      } else {
        task.status = 'failed'
        task.error = error instanceof Error ? error.message : '下载失败'
      }
    } finally {
      task.controller = null
      syncItems()
    }
  }, [syncItems])

  const pump = useCallback(() => {
    if (activeIdRef.current !== null) return
    const next = orderRef.current
      .map((id) => tasksRef.current.get(id))
      .find((task) => task?.status === 'queued')
    if (!next) return

    activeIdRef.current = next.id
    void runTask(next).finally(() => {
      activeIdRef.current = null
      window.setTimeout(() => pumpRef.current(), 0)
    })
  }, [runTask])
  useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  const startDownloadQueue = useCallback(async (nodeIds: string[]) => {
    if (nodeIds.length === 0) return

    let directoryHandle: FileSystemDirectoryHandle | null = null
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (picker) {
      try {
        directoryHandle = await picker.call(window, { mode: 'readwrite' })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        notifications.show({
          color: 'yellow',
          message: '无法选择保存目录，将使用浏览器默认下载方式',
        })
      }
    }

    let manifest: DownloadManifestItem[]
    try {
      manifest = await driveApi.fetchDownloadManifest(nodeIds)
    } catch {
      return
    }
    if (manifest.length === 0) {
      notifications.show({ color: 'gray', message: '所选文件夹中没有可下载的文件' })
      return
    }
    if (!directoryHandle && manifest.reduce((total, entry) => total + entry.size, 0) > 512 * 1024 * 1024) {
      notifications.show({
        color: 'yellow',
        message: '当前浏览器不支持直接写入目录，大文件队列会占用较多内存，建议改用 ZIP 下载',
      })
    }

    const tasks = manifest.map((entry: DownloadManifestItem): DownloadTask => ({
      id: crypto.randomUUID(),
      nodeId: entry.node_id,
      name: basename(entry.path),
      path: entry.path,
      size: entry.size,
      loaded: 0,
      progress: 0,
      status: 'queued',
      directoryHandle,
      controller: null,
    }))
    for (const task of tasks) {
      tasksRef.current.set(task.id, task)
      orderRef.current.push(task.id)
    }
    syncItems()
    notifications.show({ color: 'blue', message: `已加入下载队列：${tasks.length} 个文件` })
    pumpRef.current()
  }, [syncItems])

  const cancelDownload = useCallback((id: string) => {
    const task = tasksRef.current.get(id)
    if (!task) return
    if (task.status === 'downloading') task.controller?.abort()
    else if (task.status === 'queued') {
      task.status = 'cancelled'
      task.error = '已取消'
      syncItems()
    }
  }, [syncItems])

  const retryDownload = useCallback((id: string) => {
    const task = tasksRef.current.get(id)
    if (!task || !['failed', 'cancelled'].includes(task.status)) return
    task.loaded = 0
    task.progress = 0
    task.status = 'queued'
    task.error = undefined
    syncItems()
    pumpRef.current()
  }, [syncItems])

  const removeDownload = useCallback((id: string) => {
    const task = tasksRef.current.get(id)
    if (task?.status === 'downloading') task.controller?.abort()
    tasksRef.current.delete(id)
    orderRef.current = orderRef.current.filter((taskId) => taskId !== id)
    syncItems()
  }, [syncItems])

  const clearFinishedDownloads = useCallback(() => {
    for (const [id, task] of tasksRef.current) {
      if (task.status === 'success' || task.status === 'cancelled') {
        tasksRef.current.delete(id)
      }
    }
    orderRef.current = orderRef.current.filter((id) => tasksRef.current.has(id))
    syncItems()
  }, [syncItems])

  return {
    downloadItems: items,
    startDownloadQueue,
    cancelDownload,
    retryDownload,
    removeDownload,
    clearFinishedDownloads,
  }
}
