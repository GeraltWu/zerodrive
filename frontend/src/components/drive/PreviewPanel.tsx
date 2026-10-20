import { useRef, useState } from 'react'
import { ActionIcon, Box, Button, Center, Group, Loader, Paper, Stack, Text, Tooltip } from '@mantine/core'
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconMusic,
  IconPhoto,
  IconRotateClockwise,
  IconVideo,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react'
import * as driveApi from '../../lib/driveApi'
import { type MediaPreviewKind as MediaKind } from '../../lib/mediaPreview'
import type { DriveNode } from '../../types/node'

export interface PreviewData {
  node: DriveNode
  kind: MediaKind
}

const kindLabels: Record<MediaKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`
}

function KindIcon({ kind, size = 18 }: { kind: MediaKind; size?: number }) {
  if (kind === 'image') return <IconPhoto size={size} />
  if (kind === 'video') return <IconVideo size={size} />
  return <IconMusic size={size} />
}

export function PreviewPanel({
  preview,
  mediaFiles,
  onClose,
  onNavigate,
  onCollapseToggle,
  mobile = false,
  floating = false,
}: {
  preview: PreviewData
  mediaFiles: DriveNode[]
  onClose: () => void
  onNavigate: (node: DriveNode) => void
  onCollapseToggle?: () => void
  mobile?: boolean
  floating?: boolean
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const index = mediaFiles.findIndex((file) => file.id === preview.node.id)
  const previous = index > 0 ? mediaFiles[index - 1] : null
  const next = index >= 0 && index < mediaFiles.length - 1 ? mediaFiles[index + 1] : null

  const openFullscreen = () => {
    void stageRef.current?.requestFullscreen().catch(() => undefined)
  }

  const mediaStatus = failed ? (
    <Center pos="absolute" inset={0} p="xl">
      <Stack align="center" gap={6}>
        <KindIcon kind={preview.kind} size={34} />
        <Text c="gray.3" size="sm" fw={500}>无法加载预览</Text>
        <Text c="gray.5" size="xs" ta="center">可以下载文件后使用本地应用打开</Text>
      </Stack>
    </Center>
  ) : !loaded ? (
    <Center pos="absolute" inset={0}>
      <Loader size="sm" color="gray" />
    </Center>
  ) : null

  return (
    <Paper
      withBorder
      radius={mobile || floating ? 'lg' : 0}
      shadow={mobile ? 'xl' : undefined}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Group
        data-preview-drag-handle={floating || undefined}
        px="md"
        py="sm"
        gap="sm"
        wrap="nowrap"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
          cursor: floating ? 'move' : undefined,
          userSelect: floating ? 'none' : undefined,
        }}
      >
        <Center
          w={34}
          h={34}
          style={{
            flexShrink: 0,
            borderRadius: 'var(--mantine-radius-md)',
            color: 'var(--mantine-color-blue-6)',
            background: 'var(--mantine-color-blue-light)',
          }}
        >
          <KindIcon kind={preview.kind} />
        </Center>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} truncate title={preview.node.name}>{preview.node.name}</Text>
          <Text size="xs" c="dimmed" truncate>
            {kindLabels[preview.kind]} · {formatBytes(preview.node.size)}
            {index >= 0 && mediaFiles.length > 1 ? ` · ${index + 1} / ${mediaFiles.length}` : ''}
          </Text>
        </Box>
        <Group gap={3} wrap="nowrap">
          <Tooltip label="上一个">
            <ActionIcon size="sm" variant="subtle" color="gray" disabled={!previous} onClick={() => previous && onNavigate(previous)} aria-label="预览上一个文件">
              <IconChevronLeft size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="下一个">
            <ActionIcon size="sm" variant="subtle" color="gray" disabled={!next} onClick={() => next && onNavigate(next)} aria-label="预览下一个文件">
              <IconChevronRight size={17} />
            </ActionIcon>
          </Tooltip>
          {onCollapseToggle && (
            <Tooltip label="最小化">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={onCollapseToggle} aria-label="最小化预览">
                <IconArrowsMinimize size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="关闭">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose} aria-label="关闭预览">
              <IconX size={17} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Box
        ref={stageRef}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: preview.kind === 'image' ? 'auto' : 'hidden',
          minHeight: 0,
          background: 'radial-gradient(circle at 50% 35%, #202938 0%, #111722 48%, #090d14 100%)',
        }}
      >
        {preview.kind === 'video' && !failed && (
          <video
            key={preview.node.id}
            controls
            playsInline
            preload="metadata"
            src={driveApi.downloadUrl(preview.node.id)}
            onCanPlay={() => setLoaded(true)}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
        {preview.kind === 'image' && !failed && (
          <Box
            style={{
              width: `${Math.max(1, zoom) * 100}%`,
              height: `${Math.max(1, zoom) * 100}%`,
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              key={preview.node.id}
              src={driveApi.downloadUrl(preview.node.id)}
              alt={preview.node.name}
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              style={{
                width: '100%',
                height: '100%',
                padding: mobile ? 12 : 20,
                boxSizing: 'border-box',
                objectFit: 'contain',
                opacity: loaded ? 1 : 0,
                transform: `scale(${Math.min(1, zoom)}) rotate(${rotation}deg)`,
                transition: 'transform 180ms ease, opacity 120ms ease',
              }}
            />
          </Box>
        )}
        {preview.kind === 'audio' && !failed && (
          <Stack align="center" gap="lg" p="xl" w="100%">
            <Center
              w={96}
              h={96}
              style={{
                borderRadius: '50%',
                color: 'var(--mantine-color-blue-3)',
                background: 'linear-gradient(145deg, rgba(51, 154, 240, .26), rgba(132, 94, 247, .18))',
                border: '1px solid rgba(255, 255, 255, .12)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, .28)',
              }}
            >
              <IconMusic size={42} stroke={1.5} />
            </Center>
            <Box ta="center" maw="100%">
              <Text c="white" fw={600} truncate>{preview.node.name}</Text>
              <Text c="gray.5" size="xs" mt={3}>{formatBytes(preview.node.size)}</Text>
            </Box>
            <audio
              key={preview.node.id}
              controls
              preload="metadata"
              src={driveApi.downloadUrl(preview.node.id)}
              onCanPlay={() => setLoaded(true)}
              onError={() => setFailed(true)}
              style={{ width: 'min(100%, 420px)' }}
            />
          </Stack>
        )}
        {mediaStatus}
      </Box>

      <Group
        px="md"
        py={8}
        justify="space-between"
        wrap="nowrap"
        style={{
          borderTop: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Group gap={3} wrap="nowrap">
          {preview.kind === 'image' && (
            <>
              <Tooltip label="缩小">
                <ActionIcon size="sm" variant="subtle" color="gray" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="缩小图片">
                  <IconZoomOut size={16} />
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed" w={38} ta="center">{Math.round(zoom * 100)}%</Text>
              <Tooltip label="放大">
                <ActionIcon size="sm" variant="subtle" color="gray" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))} aria-label="放大图片">
                  <IconZoomIn size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="旋转">
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="旋转图片">
                  <IconRotateClockwise size={16} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          <Tooltip label="全屏查看">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={openFullscreen} aria-label="全屏查看">
              <IconArrowsMaximize size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
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
