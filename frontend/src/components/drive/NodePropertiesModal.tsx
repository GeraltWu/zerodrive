import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { DriveNode } from '../../types/node'
import * as driveApi from '../../lib/driveApi'
import { copyTextToClipboard } from '../../lib/clipboard'

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

export function NodePropertiesModal({
  node,
  reparsing,
  onReparse,
  onClose,
}: {
  node: DriveNode | null
  reparsing: boolean
  onReparse: (node: DriveNode) => void
  onClose: () => void
}) {
  const opened = node !== null
  const displayNode = node

  const copyValue = async (value: string, successMessage: string) => {
    const ok = await copyTextToClipboard(value)
    notifications.show({
      message: ok ? successMessage : '复制失败，请手动复制',
      color: ok ? 'green' : 'red',
    })
  }

  const renderMetaValue = (value: unknown, depth = 0): React.ReactNode => {
    const indent = { marginLeft: depth * 14 }
    if (value === null || value === undefined) return <Text size="sm">—</Text>
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <Text size="sm">{String(value)}</Text>
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <Text size="sm">[]</Text>
      return (
        <Stack gap={4} style={indent}>
          {value.map((item, idx) => (
            <Group key={idx} align="flex-start" gap="xs" wrap="nowrap">
              <Text size="sm" c="dimmed">{idx}:</Text>
              {renderMetaValue(item, depth + 1)}
            </Group>
          ))}
        </Stack>
      )
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) return <Text size="sm">{'{}'}</Text>
      return (
        <Stack gap={4} style={indent}>
          {entries.map(([k, v]) => (
            <Group key={k} align="flex-start" gap="xs" wrap="nowrap">
              <Text size="sm" c="dimmed">{k}:</Text>
              {renderMetaValue(v, depth + 1)}
            </Group>
          ))}
        </Stack>
      )
    }
    return <Text size="sm">{String(value)}</Text>
  }
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={displayNode?.name || '属性'}
      size="lg"
      centered
    >
      {displayNode && (
        <Stack gap="xs">
          <Text size="sm">
            <strong>名称：</strong>
            <Text
              span
              size="sm"
              c="inherit"
              onClick={() => void copyValue(displayNode.name, '文件名已复制')}
              style={{ cursor: 'copy', textDecoration: 'underline' }}
            >
              {displayNode.name || '（空）'}
            </Text>
          </Text>
          <Text size="sm"><strong>大小：</strong>{displayNode.is_folder ? '—' : formatBytes(displayNode.size)}</Text>
          <Text size="sm"><strong>修改时间：</strong>{new Date(displayNode.updated_at).toLocaleString()}</Text>
          <Text size="sm"><strong>节点 ID：</strong>{displayNode.id}</Text>
          <Text size="sm">
            <strong>登录下载地址：</strong>
            {displayNode.is_folder ? (
              '—'
            ) : (
              <Text
                span
                size="sm"
                c="inherit"
                onClick={() => void copyValue(driveApi.absoluteDownloadUrl(displayNode.id), '下载地址已复制')}
                style={{ cursor: 'copy', textDecoration: 'underline' }}
              >
                {driveApi.absoluteDownloadUrl(displayNode.id)}
              </Text>
            )}
          </Text>
          <Group justify="space-between" align="center" mt="sm">
            <Text size="sm" fw={600}>元数据</Text>
            {!displayNode.is_folder && (
              <Button size="xs" variant="light" loading={reparsing} onClick={() => onReparse(displayNode)}>
                重新解析元数据
              </Button>
            )}
          </Group>
          {displayNode.meta_json ? renderMetaValue(displayNode.meta_json) : <Text size="sm" c="dimmed">暂无元数据</Text>}
        </Stack>
      )}
    </Modal>
  )
}
