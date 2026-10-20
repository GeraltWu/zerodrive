import { useState } from 'react'
import { ActionIcon, Box, Group, Paper, Text, Tooltip } from '@mantine/core'
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react'

import type { DownloadItem, DownloadStatus } from '../../lib/useDownloadQueue'

const barColors: Record<DownloadStatus, string> = {
  queued: 'var(--mantine-color-gray-5)',
  downloading: 'var(--mantine-color-blue-6)',
  success: 'var(--mantine-color-teal-6)',
  failed: 'var(--mantine-color-red-6)',
  cancelled: 'var(--mantine-color-gray-6)',
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function statusLabel(item: DownloadItem): string {
  if (item.status === 'queued') return '等待中'
  if (item.status === 'downloading') return item.progress > 0 ? `${item.progress}%` : '下载中'
  if (item.status === 'success') return '已完成'
  if (item.status === 'cancelled') return '已取消'
  return '下载失败'
}

export function FloatingDownloadPanel({
  items,
  onCancel,
  onRetry,
  onRemove,
  onClearFinished,
}: {
  items: DownloadItem[]
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onClearFinished: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  if (items.length === 0) return null

  const activeCount = items.filter((item) => item.status === 'downloading').length
  const queuedCount = items.filter((item) => item.status === 'queued').length
  const failedCount = items.filter((item) => item.status === 'failed').length
  const successCount = items.filter((item) => item.status === 'success').length
  const canClear = items.some((item) => item.status === 'success' || item.status === 'cancelled')
  const summary = activeCount > 0
    ? `正在下载，${queuedCount} 个等待中`
    : queuedCount > 0
      ? `${queuedCount} 个文件等待下载`
      : failedCount > 0
        ? `${failedCount} 个下载失败`
        : `${successCount} 个下载完成`

  return (
    <Paper
      shadow="md"
      radius="md"
      withBorder
      style={{
        width: 'min(390px, calc(100vw - 24px))',
        maxHeight: collapsed ? undefined : 370,
        overflow: 'hidden',
        backgroundColor: 'color-mix(in srgb, var(--mantine-color-body) 92%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Group
        gap="xs"
        px="sm"
        py={8}
        wrap="nowrap"
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--mantine-color-default-border)',
        }}
        onClick={() => setCollapsed((value) => !value)}
      >
        <IconDownload size={16} />
        <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
          {summary}
        </Text>
        <Text size="xs" c="dimmed">{items.length} 项</Text>
        {canClear && (
          <Tooltip label="清除已完成">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={(event) => {
                event.stopPropagation()
                onClearFinished()
              }}
              aria-label="清除已完成下载"
            >
              <IconTrash size={13} />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon size="xs" variant="subtle" color="gray" aria-label={collapsed ? '展开下载队列' : '收起下载队列'}>
          {collapsed ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </ActionIcon>
      </Group>

      {!collapsed && (
        <Box px="sm" pb="sm" pt={6} style={{ overflowY: 'auto', maxHeight: 310 }}>
          {items.map((item) => {
            const canCancel = item.status === 'queued' || item.status === 'downloading'
            const canRetry = item.status === 'failed' || item.status === 'cancelled'
            const barWidth = item.status === 'failed' || item.status === 'cancelled'
              ? 100
              : item.status === 'queued'
                ? 0
                : item.progress

            return (
              <Box key={item.id} mb={9}>
                <Group gap="xs" wrap="nowrap">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip label={item.path} openDelay={500}>
                      <Text size="xs" truncate>{item.name}</Text>
                    </Tooltip>
                    <Text size="10px" c="dimmed" truncate>
                      {item.status === 'downloading'
                        ? `${formatBytes(item.loaded)} / ${formatBytes(item.size)}`
                        : item.error || formatBytes(item.size)}
                    </Text>
                  </Box>
                  <Text
                    size="xs"
                    c={item.status === 'failed' ? 'red' : item.status === 'success' ? 'teal' : 'dimmed'}
                    w={58}
                    ta="right"
                  >
                    {statusLabel(item)}
                  </Text>
                  {canCancel ? (
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onCancel(item.id)} aria-label={`取消 ${item.name}`}>
                      <IconX size={12} />
                    </ActionIcon>
                  ) : canRetry ? (
                    <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => onRetry(item.id)} aria-label={`重试 ${item.name}`}>
                      <IconRefresh size={12} />
                    </ActionIcon>
                  ) : (
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onRemove(item.id)} aria-label={`移除 ${item.name}`}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  )}
                </Group>
                <Box
                  mt={4}
                  style={{
                    height: 5,
                    background: 'var(--mantine-color-gray-2)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    style={{
                      height: '100%',
                      width: `${barWidth}%`,
                      background: barColors[item.status],
                      transition: 'width 150ms ease, background 150ms ease',
                    }}
                  />
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Paper>
  )
}
