import { ActionIcon, Box, Button, Group, Paper, Text, Title } from '@mantine/core'
import { IconArrowsMinimize, IconChevronLeft, IconChevronRight, IconDownload, IconX } from '@tabler/icons-react'
import * as driveApi from '../../lib/driveApi'
import { type MediaPreviewKind as MediaKind } from '../../lib/mediaPreview'
import type { DriveNode } from '../../types/node'

export interface PreviewData {
  node: DriveNode
  kind: MediaKind
}

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

export function PreviewPanel({
  preview,
  mediaFiles,
  onClose,
  onNavigate,
  onCollapseToggle,
}: {
  preview: PreviewData
  mediaFiles: DriveNode[]
  onClose: () => void
  onNavigate: (node: DriveNode) => void
  onCollapseToggle?: () => void
}) {
  const idx = mediaFiles.findIndex((f) => f.id === preview.node.id)
  const prev = idx > 0 ? mediaFiles[idx - 1] : null
  const next = idx >= 0 && idx < mediaFiles.length - 1 ? mediaFiles[idx + 1] : null

  return (
    <Paper
      withBorder
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Group
        px="sm"
        py={8}
        justify="space-between"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-2)',
          flexShrink: 0,
        }}
      >
        <Group gap="xs">
          <ActionIcon size="sm" variant="subtle" color="gray" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="gray" disabled={!next} onClick={() => next && onNavigate(next)}>
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
        <Group gap="xs">
          {onCollapseToggle && (
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onCollapseToggle} title="折叠">
              <IconArrowsMinimize size={16} />
            </ActionIcon>
          )}
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Media */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--mantine-color-gray-light)',
          minHeight: 0,
        }}
      >
        {preview.kind === 'video' && (
          <video
            controls
            playsInline
            src={driveApi.downloadUrl(preview.node.id)}
            style={{ width: '100%', maxHeight: '100%' }}
          />
        )}
        {preview.kind === 'image' && (
          <img
            src={driveApi.downloadUrl(preview.node.id)}
            alt={preview.node.name}
            style={{ width: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
        {preview.kind === 'audio' && (
          <Box ta="center" p="md" style={{ width: '100%' }}>
            <Title order={5} mb="md">{preview.node.name}</Title>
            <audio
              controls
              autoPlay
              src={driveApi.downloadUrl(preview.node.id)}
              style={{ width: '100%' }}
            />
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Group
        px="sm"
        py={8}
        justify="space-between"
        style={{
          borderTop: '1px solid var(--mantine-color-gray-2)',
          flexShrink: 0,
        }}
      >
        <Box>
          <Text size="sm" fw={500} truncate maw={200}>{preview.node.name}</Text>
          <Text size="xs" c="dimmed">{formatBytes(preview.node.size)}</Text>
        </Box>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          onClick={() => window.open(driveApi.downloadUrl(preview.node.id), '_blank', 'noopener,noreferrer')}
        >
          下载
        </Button>
      </Group>
    </Paper>
  )
}
