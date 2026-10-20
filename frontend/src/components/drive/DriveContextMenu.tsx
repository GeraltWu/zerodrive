import { Box, Menu } from '@mantine/core'
import { IconClipboardCheck, IconClipboardCopy, IconCopy, IconDownload, IconInfoCircle, IconLink, IconLogout, IconPencil, IconPlayerPlay, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react'
import type { DriveNode } from '../../types/node'
import type { MediaPreviewKind } from '../../lib/mediaPreview'

export function DriveContextMenu({
  opened,
  x,
  y,
  selectedCount,
  targetNode,
  previewTarget,
  isFavorited,
  hasClipboard,
  onOpenChange,
  onPreview,
  onDownload,
  onQueueDownload,
  onBatchDownload,
  onCopyName,
  onCopyNode,
  onPasteNode,
  onToggleFavorite,
  onProperties,
  onRename,
  onDelete,
  onBatchDelete,
  onCreateShareLink,
  sharedRole,
  onLeaveSharedFolder,
}: {
  opened: boolean
  x: number
  y: number
  selectedCount: number
  targetNode: DriveNode | null
  previewTarget: { node: DriveNode; kind: MediaPreviewKind } | null
  isFavorited: boolean
  hasClipboard: boolean
  onOpenChange: (opened: boolean) => void
  onPreview: (p: { node: DriveNode; kind: MediaPreviewKind }) => void
  onDownload: (node: DriveNode) => void
  onQueueDownload: (node?: DriveNode) => void
  onBatchDownload: (node?: DriveNode) => void
  onCopyName: (node: DriveNode) => void
  onCopyNode: (node: DriveNode) => void
  onPasteNode: () => void
  onToggleFavorite: (node: DriveNode) => void
  onCreateShareLink: (node: DriveNode) => void
  onProperties: (node: DriveNode) => void
  onRename: (node: DriveNode) => void
  onDelete: (node: DriveNode) => void
  onBatchDelete: () => void
  sharedRole: string | null
  onLeaveSharedFolder: (node: DriveNode) => void
}) {
  const showSingleNodeItems = targetNode !== null && selectedCount === 1
  const showBatchItems = !showSingleNodeItems && selectedCount > 1
  const effectiveOpened = opened && (showSingleNodeItems || showBatchItems || (hasClipboard && !showSingleNodeItems && !showBatchItems))
  const isShared = sharedRole !== null
  const canModify = !isShared || sharedRole === 'admin'
  const canShare = !isShared || sharedRole === 'admin'

  return (
    <Menu opened={effectiveOpened} onChange={onOpenChange} position="bottom-start" shadow="md">
      <Menu.Target>
        <Box
          style={{
            position: 'fixed',
            left: x,
            top: y,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {showSingleNodeItems && targetNode ? (
          <>
            {isShared && (
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={() => onLeaveSharedFolder(targetNode)}
              >
                退出共享
              </Menu.Item>
            )}
            {previewTarget && (
              <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={() => onPreview(previewTarget)}>
                预览
              </Menu.Item>
            )}
            {!targetNode.is_folder && (
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onDownload(targetNode)}>
                下载
              </Menu.Item>
            )}
            {targetNode.is_folder && (
              <>
                <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onQueueDownload(targetNode)}>
                  逐个下载
                </Menu.Item>
                <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onBatchDownload(targetNode)}>
                  打包为 ZIP
                </Menu.Item>
              </>
            )}
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => onCopyName(targetNode)}>
              复制文件名
            </Menu.Item>
            <Menu.Item leftSection={<IconClipboardCopy size={14} />} onClick={() => onCopyNode(targetNode)}>
              复制
            </Menu.Item>
            {hasClipboard && (
              <Menu.Item leftSection={<IconClipboardCheck size={14} />} onClick={() => onPasteNode()}>
                粘贴
              </Menu.Item>
            )}
            {targetNode.is_folder && (
              <Menu.Item
                leftSection={isFavorited ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                onClick={() => onToggleFavorite(targetNode)}
              >
                {isFavorited ? '取消收藏' : '添加到收藏'}
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconInfoCircle size={14} />} onClick={() => onProperties(targetNode)}>
              属性
            </Menu.Item>
            {canShare && (
              <Menu.Item leftSection={<IconLink size={14} />} onClick={() => onCreateShareLink(targetNode)}>
                分享
              </Menu.Item>
            )}
            {canModify && (
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => onRename(targetNode)}>
                重命名
              </Menu.Item>
            )}
            {canModify && (
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onDelete(targetNode)}>
                删除
              </Menu.Item>
            )}
          </>
        ) : showBatchItems ? (
          <>
            <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onQueueDownload()}>
              逐个下载已选（{selectedCount}）
            </Menu.Item>
            <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onBatchDownload()}>
              打包下载已选（{selectedCount}）
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onBatchDelete}>
              删除已选（{selectedCount}）
            </Menu.Item>
            {hasClipboard && (
              <Menu.Item leftSection={<IconClipboardCheck size={14} />} onClick={() => onPasteNode()}>
                粘贴
              </Menu.Item>
            )}
          </>
        ) : hasClipboard ? (
          <Menu.Item leftSection={<IconClipboardCheck size={14} />} onClick={() => onPasteNode()}>
            粘贴
          </Menu.Item>
        ) : null
        }
      </Menu.Dropdown>
    </Menu>
  )
}
