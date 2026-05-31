import { useState } from 'react'
import { ActionIcon, Box, Group, Paper, Text } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconUpload, IconX } from '@tabler/icons-react'
import type { UploadItem, UploadStatus } from './DriveContentPane'

const barColors: Record<UploadStatus, string> = {
  uploading: 'var(--mantine-color-blue-6)',
  success: 'var(--mantine-color-teal-6)',
  failed: 'var(--mantine-color-red-6)',
}

export function FloatingUploadPanel({
  items,
  onRemove,
}: {
  items: UploadItem[]
  onRemove: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (items.length === 0) return null

  const uploadingCount = items.filter((i) => i.status === 'uploading').length
  const failedCount = items.filter((i) => i.status === 'failed').length
  const successCount = items.filter((i) => i.status === 'success').length

  return (
    <Paper
      shadow="md"
      radius="md"
      withBorder
      style={{
        width: 360,
        maxHeight: collapsed ? undefined : 320,
        overflow: 'hidden',
        backgroundColor: 'color-mix(in srgb, var(--mantine-color-body) 92%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <Group
        gap="xs"
        px="sm"
        py={8}
        style={{ cursor: 'pointer', userSelect: 'none', borderBottom: collapsed ? 'none' : '1px solid var(--mantine-color-gray-2)' }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <IconUpload size={16} />
        <Text size="sm" fw={500} style={{ flex: 1 }}>
          {uploadingCount > 0
            ? `${uploadingCount} 个文件上传中…`
            : failedCount > 0
              ? `${failedCount} 个上传失败`
              : `${successCount} 个已完成`}
        </Text>
        <Text size="xs" c="dimmed">
          {items.length} 项
        </Text>
        <ActionIcon size="xs" variant="subtle" color="gray">
          {collapsed ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </ActionIcon>
      </Group>

      {/* Body */}
      {!collapsed && (
        <Box px="sm" pb="sm" pt={6} style={{ overflowY: 'auto', maxHeight: 260 }}>
          {items.map((item) => {
            const isFailed = item.status === 'failed'
            const isSuccess = item.status === 'success'
            const width = isFailed ? 100 : item.progress
            const label =
              item.status === 'uploading' ? `${item.progress}%` : isSuccess ? '已完成' : '上传失败'

            return (
              <Group key={item.id} gap="xs" mb={6} wrap="nowrap">
                <Text size="xs" truncate style={{ flex: 1, maxWidth: 160 }}>
                  {item.name}
                </Text>
                <Box style={{ flex: 1, minWidth: 40 }}>
                  <Box
                    style={{
                      height: 6,
                      background: 'var(--mantine-color-gray-2)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      style={{
                        height: '100%',
                        width: `${width}%`,
                        background: barColors[item.status],
                        transition: 'width 200ms ease, background 200ms ease',
                      }}
                    />
                  </Box>
                </Box>
                <Text
                  size="xs"
                  c={isFailed ? 'red' : isSuccess ? 'teal' : 'dimmed'}
                  w={52}
                  ta="right"
                >
                  {label}
                </Text>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (item.status === 'uploading') item.cancel()
                    onRemove(item.id)
                  }}
                >
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            )
          })}
        </Box>
      )}
    </Paper>
  )
}
