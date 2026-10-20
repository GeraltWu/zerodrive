import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Box,
  CopyButton,
  Group,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCopy, IconHistory, IconPlayerPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import * as driveApi from '../lib/driveApi'
import type { ShareLinkWithNode } from '../types/node'

function Th({ children, w }: { children: React.ReactNode; w?: number }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Table.Th
      w={w}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? 'var(--mantine-color-blue-light)' : undefined,
        transition: 'background-color 150ms ease',
      }}
    >
      {children}
    </Table.Th>
  )
}

export function ShareLinksPage() {
  const navigate = useNavigate()
  const [links, setLinks] = useState<ShareLinkWithNode[]>([])

  const load = useCallback(() => {
    driveApi.listAllShareLinks().then(setLinks).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (linkId: string) => {
    try {
      await driveApi.toggleShareLink(linkId)
      load()
    } catch { /* handled by interceptor */ }
  }

  const handleRevoke = async (linkId: string) => {
    try {
      await driveApi.revokeShareLink(linkId)
      load()
      notifications.show({ color: 'green', message: '分享链接已撤销' })
    } catch { /* handled by interceptor */ }
  }

  const formatExpire = (d: string | null) => {
    if (!d) return '永不过期'
    return new Date(d).toLocaleString()
  }

  return (
    <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
      <Title order={4} mb="md">
        分享链接管理
      </Title>

      {links.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          暂无分享链接。在文件或文件夹上右键 →「分享」创建。
        </Text>
      ) : (
        <Table
          striped
          highlightOnHover
          withTableBorder
          withColumnBorders
          style={{ width: '100%', tableLayout: 'auto' }}
        >
          <Table.Thead>
            <Table.Tr>
              <Th>文件 / 文件夹</Th>
              <Th>链接</Th>
              <Th>密码</Th>
              <Th>过期时间</Th>
              <Th>访问次数</Th>
              <Th w={100}>状态</Th>
              <Th w={120}>操作</Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {links.map((link) => (
              <Table.Tr key={link.id} opacity={link.is_active ? 1 : 0.5}>
                <Table.Td>
                  <Text truncate maw={220}>
                    {link.node_name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm">/s/{link.token}</Text>
                    <CopyButton value={driveApi.absoluteShareUrl(link.token)}>
                      {({ copied, copy }) => (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={copied ? 'teal' : 'gray'}
                          onClick={copy}
                          aria-label="复制分享页链接"
                          title="复制分享页链接"
                        >
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      )}
                    </CopyButton>
                  </Group>
                </Table.Td>
                <Table.Td>{link.has_password ? '是' : '否'}</Table.Td>
                <Table.Td>{formatExpire(link.expire_at)}</Table.Td>
                <Table.Td>
                  {link.max_access_count === null
                    ? `${link.access_count} 次`
                    : `${link.access_count} / ${link.max_access_count} 次`}
                </Table.Td>
                <Table.Td>
                  <Badge color={link.is_active ? 'teal' : 'red'} variant="light">
                    {link.is_active ? '生效中' : '已停用'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={() => navigate(`/access-logs?share_token=${encodeURIComponent(link.token)}`)}
                      title="访问记录"
                      aria-label="查看访问记录"
                    >
                      <IconHistory size={18} />
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={link.is_active ? 'yellow' : 'teal'}
                      onClick={() => handleToggle(link.id)}
                      title={link.is_active ? '停用分享链接' : '启用分享链接'}
                      aria-label={link.is_active ? '停用分享链接' : '启用分享链接'}
                    >
                      {link.is_active ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => handleRevoke(link.id)}
                      title="撤销分享链接"
                      aria-label="撤销分享链接"
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Box>
  )
}
