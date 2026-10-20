import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Drawer,
  Group,
  Menu,
  Paper,
  Table,
  Text,
  TextInput,
} from '@mantine/core'
import { useMergedRef } from '@mantine/hooks'

const LAST_FOLDER_KEY = 'zd_last_folder'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconClipboardCopy,
  IconCopy,
  IconDots,
  IconDownload,
  IconInfoCircle,
  IconLink,
  IconPencil,
  IconPlayerPlay,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import {
  type CollisionDetection,
  DndContext,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { CollaboratorDialog } from '../components/drive/CollaboratorDialog'
import { DriveContentPane, type SortDir, type SortKey, type UploadItem, type ViewMode } from '../components/drive/DriveContentPane'
import { DriveContextMenu } from '../components/drive/DriveContextMenu'
import { DriveGrid } from '../components/drive/DriveGrid'
import { DriveSidebar } from '../components/drive/DriveSidebar'
import { DriveToolbar } from '../components/drive/DriveToolbar'
import { NodePropertiesModal } from '../components/drive/NodePropertiesModal'
import { useAppContext } from '../appContext'
import { ShareLinkDialog } from '../components/drive/ShareLinkDialog'
import { copyTextToClipboard } from '../lib/clipboard'
import { FileTypeIcon } from '../lib/fileTypeIcon'
import * as driveApi from '../lib/driveApi'
import { getMediaPreviewKind } from '../lib/mediaPreview'
import type { BreadcrumbItem, DriveNode, FolderTreeItem } from '../types/node'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(1)} ${u[i]}`
}

function crumbLabel(c: BreadcrumbItem, rootId: string): string {
  if (c.id === rootId) return '全部文件'
  return c.name === '根' ? '全部文件' : c.name || '文件夹'
}

type DropTargetType = 'breadcrumb' | 'tree' | 'row'

function toDropTargetFolderId(dropId: string): string | null {
  if (dropId.startsWith('row-folder:')) return dropId.slice('row-folder:'.length)
  if (dropId.startsWith('crumb-folder:')) return dropId.slice('crumb-folder:'.length)
  if (dropId.startsWith('tree-folder:')) return dropId.slice('tree-folder:'.length)
  return null
}

function NodeTableRow({
  node,
  onEnterFolder,
  onDownload,
  onRename,
  onDelete,
  isNameEditing,
  nameEditValue,
  onNameEditChange,
  onNameEditCommit,
  onNameEditBlurCommit,
  onNameEditCancel,
  nameInputRef,
  selected,
  onRowClick,
  onRowContextMenu,
  onRowDoubleClick,
  openMediaPreview,
  onProperties,
  showOwner,
  onCopyNode,
  onCopyDirectLink,
  onToggleFavorite,
  isFavorited,
  onCreateShareLink,
  canShare,
  mobile,
}: {
  node: DriveNode
  onEnterFolder: (n: DriveNode) => void
  onDownload: (n: DriveNode) => void
  onRename: (n: DriveNode) => void
  onDelete: (n: DriveNode) => void
  isNameEditing: boolean
  nameEditValue: string
  onNameEditChange: (v: string) => void
  onNameEditCommit: () => void
  onNameEditBlurCommit: () => void
  onNameEditCancel: () => void
  nameInputRef: RefObject<HTMLInputElement | null>
  selected: boolean
  onRowClick: (e: React.MouseEvent, node: DriveNode) => void
  onRowContextMenu: (e: React.MouseEvent, node: DriveNode) => void
  onRowDoubleClick: (e: React.MouseEvent, node: DriveNode) => void
  openMediaPreview: (n: DriveNode) => void
  onProperties: (n: DriveNode) => void
  showOwner: boolean
  onCopyNode: (n: DriveNode) => void
  onCopyDirectLink: (n: DriveNode) => void
  onToggleFavorite: (n: DriveNode) => void
  isFavorited: boolean
  onCreateShareLink: (n: DriveNode) => void
  canShare: boolean
  mobile: boolean
}) {
  const drag = useDraggable({
    id: `item:${node.id}`,
    disabled: isNameEditing,
  })
  const drop = useDroppable({
    id: `row-folder:${node.id}`,
    disabled: !node.is_folder,
    data: {
      dropType: 'row' as DropTargetType,
    },
  })
  const ref = useMergedRef(drag.setNodeRef, drop.setNodeRef)

  const style = {
    transform: CSS.Translate.toString(drag.transform),
    opacity: drag.isDragging ? 0.6 : 1,
    background: drop.isOver
      ? 'var(--mantine-color-blue-light)'
      : selected
        ? 'var(--mantine-color-blue-light)'
        : undefined,
  }

  return (
    <Table.Tr
      ref={ref as React.Ref<HTMLTableRowElement>}
      data-drive-node-row
      style={style}
      onMouseDown={(e) => {
        // Shift+点击时浏览器会扩展文本选中范围；阻止默认即可保留多选、不选中文字
        if (e.shiftKey) e.preventDefault()
      }}
      onClick={(e) => onRowClick(e, node)}
      onDoubleClick={(e) => onRowDoubleClick(e, node)}
      onContextMenu={(e) => onRowContextMenu(e, node)}
    >
      <Table.Td
        {...(isNameEditing ? {} : { ...drag.listeners, ...drag.attributes })}
        style={{
          cursor: isNameEditing ? undefined : 'grab',
          verticalAlign: 'middle',
        }}
      >
        {isNameEditing ? (
          <Box
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
              boxSizing: 'border-box',
              padding: '0 8px',
              borderRadius: 'var(--mantine-radius-sm)',
              backgroundColor: 'var(--mantine-color-blue-light)',
              border: '1px solid var(--mantine-color-blue-filled)',
              boxShadow: '0 0 0 2px var(--mantine-color-blue-light)',
            }}
          >
            <FileTypeIcon node={node} size={18} style={{ flexShrink: 0 }} />
            <TextInput
              ref={nameInputRef}
              variant="unstyled"
              value={nameEditValue}
              onChange={(e) => onNameEditChange(e.currentTarget.value)}
              onBlur={() => onNameEditBlurCommit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onNameEditCommit()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  onNameEditCancel()
                }
              }}
              styles={{
                root: {
                  flex: 1,
                  minWidth: 0,
                },
                input: {
                  height: 22,
                  minHeight: 22,
                  maxHeight: 22,
                  lineHeight: '22px',
                  padding: 0,
                  fontSize: 'var(--mantine-font-size-sm)',
                  fontWeight: 500,
                  color: 'var(--mantine-color-text)',
                  border: 'none',
                  backgroundColor: 'transparent',
                  outline: 'none',
                  boxShadow: 'none',
                },
              }}
            />
          </Box>
        ) : (
          <Anchor
            inherit
            onClick={(e) => {
              e.preventDefault()
              if (node.is_folder) onEnterFolder(node)
              // 文件名单击仅配合行多选；下载用「点击下载」列；音视频双击预览
            }}
          >
            <Group gap={6} wrap="nowrap" align="center" display="inline-flex">
              <FileTypeIcon node={node} size={18} />
              <Text span inherit component="span">
                {node.is_folder ? node.name || '文件夹' : node.name}
              </Text>
            </Group>
            {showOwner && node.owner_username && (
              <Text size="xs" c="dimmed" ml={24}>
                {node.owner_username}
              </Text>
            )}
          </Anchor>
        )}
      </Table.Td>
      {!mobile && <Table.Td>{node.is_folder ? '—' : formatBytes(node.size)}</Table.Td>}
      {!mobile && <Table.Td>{new Date(node.updated_at).toLocaleString()}</Table.Td>}
      {!mobile && (
        <Table.Td>
          {node.is_folder ? (
            '—'
          ) : (
            <ActionIcon
              variant="subtle"
              color="blue"
              size="sm"
              component="a"
              href={driveApi.downloadUrl(node.id)}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <IconDownload size={16} />
            </ActionIcon>
          )}
        </Table.Td>
      )}
      <Table.Td w={60}>
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label="更多">
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {!node.is_folder && getMediaPreviewKind(node.name) && (
              <Menu.Item
                leftSection={<IconPlayerPlay size={14} />}
                onClick={() => openMediaPreview(node)}
              >
                预览
              </Menu.Item>
            )}
            {!node.is_folder && (
              <Menu.Item leftSection={<IconUpload size={14} />} onClick={() => onDownload(node)}>
                下载
              </Menu.Item>
            )}
            {!node.is_folder && canShare && (
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                onClick={() => onCopyDirectLink(node)}
              >
                创建公开下载直链
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<IconCopy size={14} />}
              onClick={() => {
                void (async () => {
                  const ok = await copyTextToClipboard(node.name)
                  notifications.show({
                    message: ok ? '文件名已复制' : '复制失败，请手动复制',
                    color: ok ? 'green' : 'red',
                  })
                })()
              }}
            >
              复制文件名
            </Menu.Item>
            <Menu.Item leftSection={<IconClipboardCopy size={14} />} onClick={() => onCopyNode(node)}>
              复制
            </Menu.Item>
            {node.is_folder && (
              <Menu.Item
                leftSection={isFavorited ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                onClick={() => onToggleFavorite(node)}
              >
                {isFavorited ? '取消收藏' : '添加到收藏'}
              </Menu.Item>
            )}
            {canShare && (
              <Menu.Item leftSection={<IconLink size={14} />} onClick={() => onCreateShareLink(node)}>
                分享
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconInfoCircle size={14} />} onClick={() => onProperties(node)}>
              属性
            </Menu.Item>
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              onClick={() => {
                window.setTimeout(() => onRename(node), 0)
              }}
            >
              重命名
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onDelete(node)}
            >
              删除
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  )
}

export function DrivePage() {
  const { isMobile, sidebarOpen, toggleSidebar, setPreview, setMediaFiles, setUploadItems, uploadItems } = useAppContext()
  const [rootId, setRootId] = useState<string | null>(null)
  const [nav, setNav] = useState<{ stack: string[]; index: number } | null>(null)
  const [rows, setRows] = useState<DriveNode[]>([])
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>([])
  const [flatFolders, setFlatFolders] = useState<FolderTreeItem[]>([])
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DriveNode[]>([])
  const [clipboardNode, setClipboardNode] = useState<{ nodeId: string; nodeName: string } | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteNodes, setFavoriteNodes] = useState<DriveNode[]>([])
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    opened: boolean
    x: number
    y: number
    targetId: string | null
  }>({
    opened: false,
    x: 0,
    y: 0,
    targetId: null,
  })
  const [propertiesNode, setPropertiesNode] = useState<DriveNode | null>(null)
  const [reparsingMeta, setReparsingMeta] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [collabDialog, setCollabDialog] = useState<{
    folderId: string
    folderName: string
  } | null>(null)
  const [shareLinkDialog, setShareLinkDialog] = useState<{
    nodeId: string
    nodeName: string
  } | null>(null)
  const [sharedFolderRoles, setSharedFolderRoles] = useState<Map<string, string>>(new Map())
  const [sharedFolderNames, setSharedFolderNames] = useState<Map<string, string>>(new Map())
  const nameInputRef = useRef<HTMLInputElement>(null)
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map())
  const [refreshKey, setRefreshKey] = useState(0)
  const fileDragDepthRef = useRef(0)
  /** 避免从 Menu 进入编辑时，关闭菜单触发的瞬时 blur 立刻提交并退出编辑 */
  const nameEditBlurOkRef = useRef(false)

  const folderId = useMemo(
    () => (nav && nav.stack.length > 0 ? nav.stack[nav.index]! : null),
    [nav],
  )
  const sharedRole = folderId ? sharedFolderRoles.get(folderId) : undefined
  const isOwnFolder = folderId !== null && !sharedRole
  const isSharedFolder = folderId !== null && !!sharedRole
  const canManageCollaborators = isOwnFolder || sharedRole === 'admin'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const folderParentMap = useMemo(
    () => new Map(flatFolders.map((f) => [f.id, f.parent_id] as const)),
    [flatFolders],
  )
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r] as const)), [rows])
  const favoriteNodesById = useMemo(
    () => new Map(favoriteNodes.map((n) => [n.id, n] as const)),
    [favoriteNodes],
  )
  const sharedFoldersById = useMemo(
    () =>
      new Map(
        Array.from(sharedFolderNames.entries()).map(([id, name]) => [
          id,
          {
            id,
            name,
            is_folder: true,
            parent_id: '',
            size: 0,
            mime_type: null,
            meta_json: null,
            owner_id: '',
            owner_username: '',
            blob_id: null,
            updated_at: '',
          } as DriveNode,
        ]),
      ),
    [sharedFolderNames],
  )
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    sorted.sort((a, b) => {
      // 文件夹和文件各自成组：正序文件夹在前，倒序文件在前
      if (a.is_folder !== b.is_folder) {
        return sortDir === 'asc' ? (a.is_folder ? -1 : 1) : (a.is_folder ? 1 : -1)
      }
      let va: string | number, vb: string | number
      switch (sortKey) {
        case 'name':
          va = (a.name || '').toLowerCase()
          vb = (b.name || '').toLowerCase()
          break
        case 'size':
          va = a.size
          vb = b.size
          break
        case 'updated_at':
          va = a.updated_at
          vb = b.updated_at
          break
        default:
          return 0
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [rows, sortKey, sortDir])
  const handleSortChange = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir('asc')
      }
    },
    [sortKey],
  )
  const selectedNodes = useMemo(
    () => selectedIds.map((id) => rowsById.get(id)).filter((n): n is DriveNode => !!n),
    [selectedIds, rowsById],
  )
  const contextMenuTargetNode = useMemo(() => {
    const tid = contextMenu.targetId
    if (!tid) return null
    return rowsById.get(tid) ?? favoriteNodesById.get(tid) ?? sharedFoldersById.get(tid) ?? null
  }, [contextMenu.targetId, rowsById, favoriteNodesById, sharedFoldersById])
  const contextMenuPreviewTarget = useMemo(() => {
    if (!contextMenuTargetNode || contextMenuTargetNode.is_folder) return null
    const kind = getMediaPreviewKind(contextMenuTargetNode.name)
    return kind ? { node: contextMenuTargetNode, kind } : null
  }, [contextMenuTargetNode])
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const collisions = pointerWithin(args)

    const priority: Record<DropTargetType, number> = {
      breadcrumb: 0,
      tree: 1,
      row: 2,
    }
    const getDropType = (id: string | number): DropTargetType => {
      const container = args.droppableContainers.find((c) => c.id === id)
      const t = container?.data.current?.dropType
      if (t === 'breadcrumb' || t === 'tree' || t === 'row') return t
      return 'row'
    }

    return [...collisions].sort((a, b) => {
      const ap = priority[getDropType(a.id)]
      const bp = priority[getDropType(b.id)]
      if (ap !== bp) return ap - bp
      const av = typeof a.data?.value === 'number' ? a.data.value : 0
      const bv = typeof b.data?.value === 'number' ? b.data.value : 0
      return bv - av
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!folderId) return
    let list: DriveNode[]
    try {
      // Only the first two depend on folderId; the rest are global.
      // If the folder was deleted, these 404 and we should recover.
      const bc = await driveApi.fetchBreadcrumb(folderId)
      const [l, tree, shared, favs] = await Promise.all([
        driveApi.listChildren(folderId),
        driveApi.fetchFolderTree(),
        driveApi.listSharedWithMe(),
        driveApi.listFavorites(),
      ])
      list = l
      setCrumbs(bc)
      setRows(list)
      setFlatFolders(tree)
      setSharedFolderRoles(new Map(shared.map((s) => [s.folder_id, s.role])))
      setSharedFolderNames(new Map(shared.map((s) => [s.folder_id, s.folder_name])))
      setFavoriteIds(new Set(favs.map((f) => f.id)))
      setFavoriteNodes(favs)
      setRefreshKey((k) => k + 1)
    } catch {
      localStorage.removeItem(LAST_FOLDER_KEY)
      if (rootId) setNav({ stack: [rootId], index: 0 })
      return
    }
  }, [folderId, rootId])

  const displayRows = useMemo(() => {
    if (searchQuery.trim()) return searchResults
    return sortedRows
  }, [searchQuery, searchResults, sortedRows])

  const selectRange = useCallback(
    (fromId: string, toId: string) => {
      const from = displayRows.findIndex((r) => r.id === fromId)
      const to = displayRows.findIndex((r) => r.id === toId)
      if (from < 0 || to < 0) return [toId]
      const [start, end] = from <= to ? [from, to] : [to, from]
      return displayRows.slice(start, end + 1).map((r) => r.id)
    },
    [displayRows],
  )

  const applyRowSelection = useCallback(
    (nodeId: string, e: Pick<React.MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>) => {
      if (e.shiftKey) {
        const anchor = selectionAnchorId ?? nodeId
        const range = selectRange(anchor, nodeId)
        setSelectedIds(range)
        setSelectionAnchorId(anchor)
        return
      }
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) =>
          prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId],
        )
        setSelectionAnchorId(nodeId)
        return
      }
      setSelectedIds([nodeId])
      setSelectionAnchorId(nodeId)
    },
    [selectRange, selectionAnchorId],
  )

  // Restore last folder on mount
  useEffect(() => {
    ;(async () => {
      const id = await driveApi.fetchRootId()
      setRootId(id)
      const f = localStorage.getItem(LAST_FOLDER_KEY)
      if (f) {
        setNav({ stack: [id, f], index: 1 })
      } else {
        setNav({ stack: [id], index: 0 })
      }
    })()
  }, [])

  // Persist current folder on change
  useEffect(() => {
    if (rootId !== null && folderId !== null && folderId !== rootId) {
      localStorage.setItem(LAST_FOLDER_KEY, folderId)
    } else if (rootId !== null && folderId === rootId) {
      localStorage.removeItem(LAST_FOLDER_KEY)
    }
  }, [folderId, rootId])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setEditingNodeId(null)
      setEditDraft('')
      setSelectedIds([])
      setSelectionAnchorId(null)
      setContextMenu({ opened: false, x: 0, y: 0, targetId: null })
      if (folderId) void refresh()
    })
    return () => cancelAnimationFrame(id)
  }, [folderId, refresh])

  useEffect(() => {
    if (!editingNodeId) {
      nameEditBlurOkRef.current = false
      return
    }
    nameEditBlurOkRef.current = false
    const t = window.setTimeout(() => {
      nameEditBlurOkRef.current = true
    }, 160)
    return () => window.clearTimeout(t)
  }, [editingNodeId])

  useEffect(() => {
    if (!editingNodeId) return
    const focusNow = () => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
    const t0 = window.setTimeout(focusNow, 0)
    const t1 = window.setTimeout(() => {
      if (document.activeElement !== nameInputRef.current) focusNow()
    }, 200)
    return () => {
      window.clearTimeout(t0)
      window.clearTimeout(t1)
    }
  }, [editingNodeId])

  // Search debounce
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) return
    const timer = setTimeout(() => {
      driveApi.searchNodes(q).then(setSearchResults).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Ctrl+C / Ctrl+V keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (editingNodeId) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedIds.length === 0) return
        const n = rowsById.get(selectedIds[0]!)
        if (!n) return
        e.preventDefault()
        setClipboardNode({ nodeId: n.id, nodeName: n.name })
        notifications.show({ color: 'blue', message: `已复制: ${n.name}` })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (!clipboardNode || !folderId) return
        e.preventDefault()
        void (async () => {
          try {
            const created = await driveApi.copyNode(clipboardNode.nodeId, folderId)
            notifications.show({ color: 'green', message: `已粘贴: ${created.name}` })
            await refresh()
          } catch {
            notifications.show({ color: 'red', message: '粘贴失败' })
          }
        })()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, rowsById, editingNodeId, clipboardNode, folderId, refresh])

  const clearNameEdit = useCallback(() => {
    setEditingNodeId(null)
    setEditDraft('')
  }, [])

  const commitNameEdit = useCallback(async () => {
    if (!editingNodeId) return
    const node = rows.find((r) => r.id === editingNodeId)
    if (!node) {
      clearNameEdit()
      return
    }
    const next = editDraft.trim()
    if (!next) {
      notifications.show({ color: 'red', message: '名称不能为空' })
      requestAnimationFrame(() => nameInputRef.current?.focus())
      return
    }
    if (next === node.name) {
      clearNameEdit()
      return
    }
    try {
      await driveApi.renameNode(editingNodeId, next)
      notifications.show({ color: 'green', message: '已更新' })
      clearNameEdit()
      await refresh()
    } catch {
      /* 冲突等：保持编辑 */
    }
  }, [editingNodeId, editDraft, rows, clearNameEdit, refresh])

  const commitNameEditFromBlur = useCallback(() => {
    if (!nameEditBlurOkRef.current) return
    void commitNameEdit()
  }, [commitNameEdit])

  const cancelNameEdit = useCallback(() => {
    clearNameEdit()
  }, [clearNameEdit])

  const startRename = useCallback((node: DriveNode) => {
    setEditingNodeId(node.id)
    setEditDraft(node.name)
  }, [])

  const suggestNewFolderName = useCallback(() => {
    const base = '新建文件夹'
    let name = base
    let i = 2
    while (rows.some((r) => r.name === name)) {
      name = `${base} (${i})`
      i++
    }
    return name
  }, [rows])

  const navigateTo = useCallback((id: string) => {
    setNav((prev) => {
      if (!prev) return { stack: [id], index: 0 }
      if (prev.stack[prev.index] === id) return prev
      const stack = [...prev.stack.slice(0, prev.index + 1), id]
      return { stack, index: stack.length - 1 }
    })
  }, [])

  const goBack = useCallback(() => {
    setNav((prev) =>
      prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev,
    )
  }, [])

  const goForward = useCallback(() => {
    setNav((prev) =>
      prev && prev.index < prev.stack.length - 1
        ? { ...prev, index: prev.index + 1 }
        : prev,
    )
  }, [])

  const goUp = useCallback(() => {
    if (!rootId || crumbs.length < 2) return
    const parentId = crumbs[crumbs.length - 2]?.id
    if (!parentId) return
    navigateTo(parentId)
  }, [rootId, crumbs, navigateTo])

  const onBreadcrumbSegment = useCallback(
    (segmentIndex: number) => {
      if (segmentIndex >= crumbs.length - 1) return
      const targetId = crumbs[segmentIndex]?.id
      if (!targetId) return
      navigateTo(targetId)
    },
    [crumbs, navigateTo],
  )

  const onTreeSelect = useCallback(
    async (id: string) => {
      navigateTo(id)
    },
    [navigateTo],
  )

  const enterFolder = (n: DriveNode) => {
    if (!n.is_folder) return
    navigateTo(n.id)
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setDraggingNodeId(null)
    const activeDraggingIds = draggingNodeIds.length > 0 ? draggingNodeIds : []
    setDraggingNodeIds([])
    if (!over) return
    const aid = String(active.id)
    const oid = String(over.id)
    if (!aid.startsWith('item:')) return
    const nodeId = aid.slice(5)
    const targetFolderId = toDropTargetFolderId(oid)
    if (!targetFolderId) return
    const idsToMove = activeDraggingIds.length > 0 ? activeDraggingIds : [nodeId]

    let success = 0
    let failed = 0
    let skipped = 0
    for (const id of idsToMove) {
      if (id === targetFolderId) {
        skipped += 1
        continue
      }
      const dragged = rowsById.get(id)
      if (!dragged) {
        failed += 1
        continue
      }
      if (dragged.parent_id === targetFolderId) {
        skipped += 1
        continue
      }
      if (dragged.is_folder) {
        let cur: string | null | undefined = targetFolderId
        let invalid = false
        while (cur) {
          if (cur === id) {
            invalid = true
            break
          }
          cur = folderParentMap.get(cur)
        }
        if (invalid) {
          failed += 1
          continue
        }
      }
      try {
        await driveApi.moveNode(id, targetFolderId)
        success += 1
      } catch {
        failed += 1
      }
    }

    if (success > 0) {
      notifications.show({
        color: failed > 0 ? 'yellow' : 'green',
        message:
          idsToMove.length === 1
            ? '已移动'
            : `批量移动完成：成功 ${success}，失败 ${failed}，跳过 ${skipped}`,
      })
      await refresh()
      const movedSet = new Set(idsToMove)
      setSelectedIds((prev) => prev.filter((id) => !movedSet.has(id)))
    } else if (failed > 0) {
      notifications.show({
        color: 'red',
        message: '批量移动失败，请检查目标目录或命名冲突',
      })
    } else if (skipped > 0) {
      notifications.show({ color: 'gray', message: '所选项目已在目标目录或不可移动' })
    }
  }

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const aid = String(e.active.id)
      if (!aid.startsWith('item:')) {
        setDraggingNodeId(null)
        setDraggingNodeIds([])
        return
      }
      const id = aid.slice(5)
      setDraggingNodeId(id)
      if (selectedSet.has(id) && selectedIds.length > 1) {
        setDraggingNodeIds(selectedIds)
      } else {
        setDraggingNodeIds([id])
      }
    },
    [selectedIds, selectedSet],
  )

  const handleDragCancel = useCallback(() => {
    setDraggingNodeId(null)
    setDraggingNodeIds([])
  }, [])

  const doDelete = (node: DriveNode) => {
    modals.openConfirmModal({
      title: '删除确认',
      children: (
        <Text size="sm">
          确定删除「{node.name || '项'}」？
          {node.is_folder ? '（将删除其中所有内容）' : ''}
        </Text>
      ),
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await driveApi.deleteNode(node.id)
          notifications.show({ color: 'green', message: '已删除' })
          setSelectedIds((prev) => prev.filter((id) => id !== node.id))
          if (rootId && node.id === folderId) {
            navigateTo(rootId)
          } else {
            await refresh()
          }
        } catch {
          /* noop */
        }
      },
    })
  }

  const batchDelete = useCallback(() => {
    if (selectedNodes.length === 0) return
    const ids = selectedNodes.map((n) => n.id)
    modals.openConfirmModal({
      title: '批量删除确认',
      children: <Text size="sm">确定删除已选的 {ids.length} 项？此操作不可撤销。</Text>,
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        let success = 0
        let failed = 0
        for (const id of ids) {
          try {
            await driveApi.deleteNode(id)
            success += 1
          } catch {
            failed += 1
          }
        }
        notifications.show({
          color: failed > 0 ? 'yellow' : 'green',
          message: `批量删除完成：成功 ${success}，失败 ${failed}`,
        })
        setSelectedIds([])
        setSelectionAnchorId(null)
        await refresh()
      },
    })
  }, [refresh, selectedNodes])

  const handleRowClick = useCallback(
    (e: React.MouseEvent, node: DriveNode) => {
      if (editingNodeId === node.id) return
      applyRowSelection(node.id, e)
      setContextMenu({ opened: false, x: 0, y: 0, targetId: null })
    },
    [applyRowSelection, editingNodeId],
  )

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, node: DriveNode) => {
      e.preventDefault()
      if (!selectedSet.has(node.id)) {
        setSelectedIds([node.id])
        setSelectionAnchorId(node.id)
      }
      setContextMenu({
        opened: true,
        x: e.clientX,
        y: e.clientY,
        targetId: node.id,
      })
    },
    [selectedSet],
  )

  const handleSidebarFavoriteContextMenu = useCallback(
    (node: DriveNode, x: number, y: number) => {
      setSelectedIds([node.id])
      setSelectionAnchorId(node.id)
      setContextMenu({
        opened: true,
        x,
        y,
        targetId: node.id,
      })
    },
    [],
  )

  const handleSharedFolderContextMenu = useCallback(
    (sf: { folder_id: string; folder_name: string }, x: number, y: number) => {
      setSelectedIds([sf.folder_id])
      setSelectionAnchorId(sf.folder_id)
      setContextMenu({
        opened: true,
        x,
        y,
        targetId: sf.folder_id,
      })
    },
    [],
  )

  const handleLeaveSharedFolder = useCallback(
    async (node: DriveNode) => {
      try {
        await driveApi.leaveSharedFolder(node.id)
        notifications.show({ color: 'green', message: `已退出「${node.name}」` })
        await refresh()
      } catch {
        /* shown by interceptor */
      }
    },
    [refresh],
  )

  const clearSelectionIfOutsideRow = useCallback((e: React.PointerEvent) => {
    const t = e.target as HTMLElement | null
    if (!t) return
    if (t.closest('[data-drive-node-row]')) return
    if (t.closest('[role="menu"]')) return
    if (t.closest('[role="dialog"]')) return
    setSelectedIds([])
    setSelectionAnchorId(null)
    setContextMenu({ opened: false, x: 0, y: 0, targetId: null })
  }, [])
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, opened: false, targetId: null }))
  }, [])

  const doDownload = (node: DriveNode) => {
    window.open(driveApi.downloadUrl(node.id), '_blank', 'noopener,noreferrer')
  }

  const openMediaPreview = useCallback((node: DriveNode) => {
    const kind = getMediaPreviewKind(node.name)
    if (!kind) {
      notifications.show({ color: 'gray', message: '不支持预览该格式' })
      return
    }
    setPreview({ node, kind })
    setMediaFiles(rows.filter((r) => !r.is_folder && getMediaPreviewKind(r.name) != null))
  }, [setPreview, setMediaFiles, rows])

  const reparseMeta = useCallback(async (node: DriveNode) => {
    setReparsingMeta(true)
    try {
      const updated = await driveApi.reparseNodeMeta(node.id)
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setPropertiesNode(updated)
      notifications.show({ color: 'green', message: '元数据已重新解析' })
    } catch {
      notifications.show({ color: 'red', message: '重新解析失败，请检查 ffprobe 或文件内容' })
    } finally {
      setReparsingMeta(false)
    }
  }, [])

  const handleRowDoubleClick = useCallback(
    (e: React.MouseEvent, node: DriveNode) => {
      if (editingNodeId === node.id) return
      const el = e.target as HTMLElement | null
      if (el?.closest('button, input, textarea, a[href]')) return
      if (node.is_folder) {
        navigateTo(node.id)
        return
      }
      const kind = getMediaPreviewKind(node.name)
      if (kind) {
        e.preventDefault()
        setPreview({ node, kind })
        return
      }
      window.open(driveApi.downloadUrl(node.id), '_blank', 'noopener,noreferrer')
    },
    [editingNodeId, navigateTo, setPreview],
  )

  const newFolder = () => {
    if (!folderId) return
    void (async () => {
      try {
        const name = suggestNewFolderName()
        const created = await driveApi.createFolder(folderId, name)
        notifications.show({ color: 'green', message: '已创建' })
        await refresh()
        setEditingNodeId(created.id)
        setEditDraft(created.name)
      } catch {
        /* noop */
      }
    })()
  }

  const onPickFiles = useCallback((files: FileList | null) => {
    if (!files?.length || !folderId) return
    const fileList = Array.from(files)

    const newItems: UploadItem[] = fileList.map((f) => {
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const controller = new AbortController()
      uploadControllersRef.current.set(id, controller)
      return {
        id,
        name: f.name,
        progress: 0,
        status: 'uploading' as UploadItem['status'],
        cancel: () => {
          uploadControllersRef.current.get(id)?.abort()
          setUploadItems((prev) => prev.filter((x) => x.id !== id))
          uploadControllersRef.current.delete(id)
        },
      }
    })

    setUploadItems((prev) => [...prev, ...newItems])

    let failed = 0
    Promise.allSettled(
      newItems.map(async (item, i) => {
        const ctrl = uploadControllersRef.current.get(item.id)!
        try {
          await driveApi.uploadFile(folderId, fileList[i]!, ctrl.signal, (pct) => {
            setUploadItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress: pct } : x)))
          })
          setUploadItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, progress: 100, status: 'success' } : x)),
          )
          setTimeout(() => {
            setUploadItems((prev) => prev.filter((x) => x.id !== item.id))
            uploadControllersRef.current.delete(item.id)
          }, 3000)
        } catch (err: unknown) {
          const cancelled =
            typeof err === 'object' &&
            err !== null &&
            (('name' in err && err.name === 'CanceledError') ||
              ('code' in err && err.code === 'ERR_CANCELED'))
          if (cancelled) return
          failed += 1
          setUploadItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, status: 'failed' } : x)),
          )
          setTimeout(() => {
            setUploadItems((prev) => prev.filter((x) => x.id !== item.id))
            uploadControllersRef.current.delete(item.id)
          }, 5000)
        }
      }),
    ).then(() => {
      if (failed > 0) {
        notifications.show({
          color: 'yellow',
          message: `上传完成，${failed} 个失败`,
        })
      }
      refresh()
    })
  }, [folderId, refresh, setUploadItems])

  const handleToggleFavorite = useCallback(
    async (node: DriveNode) => {
      const isFav = favoriteIds.has(node.id)
      try {
        if (isFav) {
          await driveApi.removeFavorite(node.id)
          setFavoriteIds((prev) => {
            const next = new Set(prev)
            next.delete(node.id)
            return next
          })
          setFavoriteNodes((prev) => prev.filter((n) => n.id !== node.id))
        } else {
          await driveApi.addFavorite(node.id)
          setFavoriteIds((prev) => new Set(prev).add(node.id))
          setFavoriteNodes((prev) => [...prev, node])
        }
        setRefreshKey((k) => k + 1)
        notifications.show({
          color: 'green',
          message: isFav ? '已取消收藏' : '已添加收藏',
        })
      } catch {
        notifications.show({ color: 'red', message: '操作失败' })
      }
    },
    [favoriteIds],
  )

  const handleCreateShareLink = useCallback((node: DriveNode) => {
    setShareLinkDialog({ nodeId: node.id, nodeName: node.name })
  }, [])

  const handleCopyDirectLink = useCallback(async (node: DriveNode) => {
    try {
      const link = await driveApi.createShareLink(node.id)
      const copied = await copyTextToClipboard(driveApi.absoluteShareDownloadUrl(link.token))
      notifications.show({
        color: copied ? 'green' : 'yellow',
        message: copied
          ? '公开下载直链已创建并复制，可在「分享链接」中停用'
          : '直链已创建，请到「分享链接」页面复制',
      })
    } catch {
      // API interceptor 已显示具体错误。
    }
  }, [])

  const handleCopyNode = useCallback(
    (node: DriveNode) => {
      setClipboardNode({ nodeId: node.id, nodeName: node.name })
      notifications.show({ color: 'blue', message: `已复制: ${node.name}` })
    },
    [],
  )

  const handlePasteNode = useCallback(async () => {
    if (!clipboardNode || !folderId) return
    try {
      const created = await driveApi.copyNode(clipboardNode.nodeId, folderId)
      notifications.show({ color: 'green', message: `已粘贴: ${created.name}` })
      await refresh()
    } catch {
      notifications.show({ color: 'red', message: '粘贴失败' })
    }
  }, [clipboardNode, folderId, refresh])

  useEffect(() => {
    const hasFiles = (dt: DataTransfer | null | undefined) =>
      !!dt && Array.from(dt.types).includes('Files')

    const onWindowDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      fileDragDepthRef.current += 1
      setIsFileDragActive(true)
    }

    const onWindowDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
    }

    const onWindowDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
      if (fileDragDepthRef.current === 0) setIsFileDragActive(false)
    }

    const onWindowDrop = (e: DragEvent) => {
      e.preventDefault()
      fileDragDepthRef.current = 0
      setIsFileDragActive(false)
      if (!hasFiles(e.dataTransfer)) return
      onPickFiles(e.dataTransfer?.files ?? null)
    }

    window.addEventListener('dragenter', onWindowDragEnter)
    window.addEventListener('dragover', onWindowDragOver)
    window.addEventListener('dragleave', onWindowDragLeave)
    window.addEventListener('drop', onWindowDrop)
    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter)
      window.removeEventListener('dragover', onWindowDragOver)
      window.removeEventListener('dragleave', onWindowDragLeave)
      window.removeEventListener('drop', onWindowDrop)
    }
  }, [onPickFiles])

  useEffect(() => {
    if (!contextMenu.opened) return
    const close = () =>
      setContextMenu((prev) => ({ ...prev, opened: false, targetId: null }))
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu.opened])

  const canBack = nav !== null && nav.index > 0
  const canForward = nav !== null && nav.index < nav.stack.length - 1
  const canUp = rootId !== null && folderId !== null && folderId !== rootId

  if (!rootId || !nav || !folderId) {
    return <Text p="md">加载中…</Text>
  }

  return (
    <Box
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        padding: 'var(--mantine-spacing-md)',
      }}
    >
        {isFileDragActive && (
          <Box
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 400,
              backgroundColor: 'rgba(20, 40, 90, 0.35)',
              backdropFilter: 'blur(2px)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Paper
              shadow="md"
              radius="md"
              p="lg"
              style={{
                border: '2px dashed var(--mantine-color-blue-5)',
              }}
            >
              <Group gap="xs" align="center">
                <IconUpload size={20} />
                <Text fw={600}>松开以上传到当前文件夹</Text>
              </Group>
            </Paper>
          </Box>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: '1 1 0%',
              minHeight: 0,
              minWidth: 0,
            }}
            onPointerDownCapture={clearSelectionIfOutsideRow}
          >
          <DriveToolbar
            canBack={canBack}
            canForward={canForward}
            canUp={canUp}
            onBack={goBack}
            onForward={goForward}
            onUp={goUp}
            onRefresh={() => void refresh()}
            crumbs={crumbs}
            rootId={rootId}
            onBreadcrumbSegment={onBreadcrumbSegment}
            crumbLabel={crumbLabel}
            draggingNodeId={draggingNodeId}
            maxVisible={isMobile ? 3 : 4}
            isMobile={isMobile}
          />

        <Box
          style={{
            display: 'flex',
            flex: '1 1 0%',
            alignItems: 'flex-start',
            gap: 'var(--mantine-spacing-md)',
            width: '100%',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {isMobile ? (
            <Drawer
              opened={sidebarOpen}
              onClose={toggleSidebar}
              position="right"
              size="xs"
              title="目录"
              overlayProps={{ backgroundOpacity: 0.4 }}
            >
              <DriveSidebar
                flatFolders={flatFolders}
                rootId={rootId}
                folderId={folderId}
                onTreeSelect={(id) => {
                  toggleSidebar()
                  void onTreeSelect(id)
                }}
                draggingNodeId={draggingNodeId}
                refreshKey={refreshKey}
                favoriteNodes={favoriteNodes}
                onFavoriteContextMenu={handleSidebarFavoriteContextMenu}
                onSharedFolderContextMenu={handleSharedFolderContextMenu}
              />
              <Box mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Button
                  fullWidth
                  variant="subtle"
                  color="red"
                  size="xs"
                  onClick={async () => {
                    await driveApi.logout()
                    window.location.href = '/login'
                  }}
                >
                  退出登录
                </Button>
              </Box>
            </Drawer>
          ) : (
            <DriveSidebar
              flatFolders={flatFolders}
              rootId={rootId}
              folderId={folderId}
              onTreeSelect={(id) => void onTreeSelect(id)}
              draggingNodeId={draggingNodeId}
              refreshKey={refreshKey}
              favoriteNodes={favoriteNodes}
              onFavoriteContextMenu={handleSidebarFavoriteContextMenu}
              onSharedFolderContextMenu={handleSharedFolderContextMenu}
            />
          )}
          <DriveContentPane
            isUploading={uploadItems.length > 0}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            onNewFolder={newFolder}
            onPickFiles={onPickFiles}
            canManageCollaborators={canManageCollaborators}
            onManageCollaborators={() =>
              setCollabDialog({
                folderId: folderId!,
                folderName: crumbs.length > 0 ? crumbs[crumbs.length - 1]!.name : '文件夹',
              })
            }
            onCreateShareLink={() =>
              folderId &&
              setShareLinkDialog({
                nodeId: folderId,
                nodeName: crumbs.length > 0 ? crumbs[crumbs.length - 1]!.name : '文件夹',
              })
            }
            tableBody={displayRows.map((n) => (
              <NodeTableRow
                key={n.id}
                node={n}
                onEnterFolder={enterFolder}
                onDownload={doDownload}
                onRename={startRename}
                onDelete={doDelete}
                isNameEditing={editingNodeId === n.id}
                nameEditValue={editDraft}
                onNameEditChange={setEditDraft}
                onNameEditCommit={() => void commitNameEdit()}
                onNameEditBlurCommit={commitNameEditFromBlur}
                onNameEditCancel={cancelNameEdit}
                nameInputRef={nameInputRef}
                selected={selectedSet.has(n.id)}
                onRowClick={handleRowClick}
                onRowContextMenu={handleRowContextMenu}
                onRowDoubleClick={handleRowDoubleClick}
                openMediaPreview={openMediaPreview}
                onProperties={setPropertiesNode}
                showOwner={isSharedFolder}
                onCopyNode={handleCopyNode}
                onCopyDirectLink={(node) => void handleCopyDirectLink(node)}
                onToggleFavorite={handleToggleFavorite}
                isFavorited={favoriteIds.has(n.id)}
                onCreateShareLink={handleCreateShareLink}
                canShare={canManageCollaborators}
                mobile={isMobile}
              />
            ))}
            gridBody={
              viewMode !== 'list' ? (
                <DriveGrid
                  nodes={displayRows}
                  selectedIds={selectedSet}
                  size={viewMode}
                  onRowClick={handleRowClick}
                  onRowContextMenu={handleRowContextMenu}
                  onRowDoubleClick={handleRowDoubleClick}
                  mobile={isMobile}
                />
              ) : null
            }
            contextMenu={
              <DriveContextMenu
                opened={contextMenu.opened}
                x={contextMenu.x}
                y={contextMenu.y}
                selectedCount={selectedIds.length}
                targetNode={contextMenuTargetNode}
                previewTarget={contextMenuPreviewTarget}
                isFavorited={contextMenuTargetNode ? favoriteIds.has(contextMenuTargetNode.id) : false}
                sharedRole={contextMenuTargetNode ? sharedFolderRoles.get(contextMenuTargetNode.id) ?? null : null}
                hasClipboard={clipboardNode !== null}
                onOpenChange={(opened) =>
                  setContextMenu((prev) => ({
                    ...prev,
                    opened,
                    targetId: opened ? prev.targetId : null,
                  }))
                }
                onPreview={(p) => {
                  closeContextMenu()
                  setPreview(p)
                }}
                onDownload={(node) => {
                  closeContextMenu()
                  doDownload(node)
                }}
                onCopyLink={(node) => {
                  closeContextMenu()
                  void handleCopyDirectLink(node)
                }}
                onCopyName={(node) => {
                  closeContextMenu()
                  void (async () => {
                    const ok = await copyTextToClipboard(node.name)
                    notifications.show({
                      message: ok ? '文件名已复制' : '复制失败，请手动复制',
                      color: ok ? 'green' : 'red',
                    })
                  })()
                }}
                onCopyNode={(node) => {
                  closeContextMenu()
                  handleCopyNode(node)
                }}
                onPasteNode={() => {
                  closeContextMenu()
                  void handlePasteNode()
                }}
                onToggleFavorite={(node) => {
                  closeContextMenu()
                  void handleToggleFavorite(node)
                }}
                onRename={(node) => {
                  closeContextMenu()
                  window.setTimeout(() => startRename(node), 0)
                }}
                onProperties={(node) => {
                  closeContextMenu()
                  setPropertiesNode(node)
                }}
                onDelete={(node) => {
                  closeContextMenu()
                  doDelete(node)
                }}
                onBatchDelete={() => {
                  closeContextMenu()
                  batchDelete()
                }}
                onCreateShareLink={(node) => {
                  closeContextMenu()
                  handleCreateShareLink(node)
                }}
                onLeaveSharedFolder={(node) => {
                  closeContextMenu()
                  void handleLeaveSharedFolder(node)
                }}
              />
            }
          />
        </Box>
          </Box>
        </DndContext>
        {collabDialog && (
          <CollaboratorDialog
            folderId={collabDialog.folderId}
            folderName={collabDialog.folderName}
            isOwner={canManageCollaborators}
            opened
            onClose={() => setCollabDialog(null)}
          />
        )}
        {shareLinkDialog && (
          <ShareLinkDialog
            nodeId={shareLinkDialog.nodeId}
            nodeName={shareLinkDialog.nodeName}
            opened
            onClose={() => setShareLinkDialog(null)}
          />
        )}
        <NodePropertiesModal
          node={propertiesNode}
          reparsing={reparsingMeta}
          onReparse={(node) => void reparseMeta(node)}
          onClose={() => setPropertiesNode(null)}
        />
    </Box>
  )
}
