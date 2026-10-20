import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  NumberInput,
  PasswordInput,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCopy, IconPlayerPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import * as driveApi from '../../lib/driveApi'
import type { ShareLink } from '../../types/node'

export function ShareLinkDialog({
  nodeId,
  nodeName,
  opened,
  onClose,
}: {
  nodeId: string
  nodeName: string
  opened: boolean
  onClose: () => void
}) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [password, setPassword] = useState('')
  const [expireInHours, setExpireInHours] = useState<number | ''>('')
  const [maxAccessCount, setMaxAccessCount] = useState<number | ''>('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    driveApi.listShareLinks(nodeId).then(setLinks).catch(() => {})
  }, [nodeId])

  useEffect(() => {
    if (opened) load()
  }, [opened, load])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await driveApi.createShareLink(nodeId, {
        password: password || undefined,
        expireInHours: expireInHours || undefined,
        maxAccessCount: maxAccessCount || undefined,
      })
      setPassword('')
      setExpireInHours('')
      setMaxAccessCount('')
      load()
      notifications.show({ color: 'green', message: '分享链接已创建' })
    } catch {
      /* error shown by api layer */
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (linkId: string) => {
    try {
      const updated = await driveApi.toggleShareLink(linkId)
      load()
      notifications.show({
        color: 'green',
        message: updated.is_active ? '分享链接已启用' : '分享链接已停用',
      })
    } catch {
      /* error shown by api layer */
    }
  }

  const handleRevoke = async (linkId: string) => {
    try {
      await driveApi.revokeShareLink(linkId)
      load()
      notifications.show({ color: 'green', message: '分享链接已撤销' })
    } catch {
      /* error shown by api layer */
    }
  }

  const formatExpire = (d: string | null) => {
    if (!d) return '永不过期'
    return new Date(d).toLocaleString()
  }

  const formatAccess = (current: number, max: number | null) => {
    if (max === null) return `${current} 次`
    return `${current} / ${max} 次`
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`分享 — ${nodeName}`} size="lg" centered>
      <Stack gap="md">
        {/* Create form */}
        <Text size="sm" fw={500}>
          创建新链接
        </Text>
        <Group gap="sm" wrap="wrap" align="flex-end">
          <PasswordInput
            size="sm"
            placeholder="访问密码（可选）"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            style={{ width: 160 }}
          />
          <NumberInput
            size="sm"
            placeholder="有效期（小时）"
            value={expireInHours}
            onChange={(v) => setExpireInHours(v === '' ? '' : Number(v))}
            min={1}
            style={{ width: 140 }}
          />
          <NumberInput
            size="sm"
            placeholder="最大访问次数"
            value={maxAccessCount}
            onChange={(v) => setMaxAccessCount(v === '' ? '' : Number(v))}
            min={1}
            style={{ width: 140 }}
          />
          <Button size="sm" loading={creating} onClick={handleCreate}>
            生成链接
          </Button>
        </Group>

        {/* Existing links */}
        {links.length > 0 && (
          <>
            <Divider />
            <Text size="sm" fw={500}>
              已有链接
            </Text>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>链接</Table.Th>
                  <Table.Th>密码</Table.Th>
                  <Table.Th>过期时间</Table.Th>
                  <Table.Th>访问次数</Table.Th>
                  <Table.Th w={70}>状态</Table.Th>
                  <Table.Th w={80}>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {links.map((link) => (
                  <Table.Tr key={link.id}>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" truncate maw={160}>
                          /s/{link.token.slice(0, 12)}…
                        </Text>
                        <CopyButton value={driveApi.absoluteShareUrl(link.token)}>
                          {({ copied, copy }) => (
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color={copied ? 'teal' : 'gray'}
                              onClick={copy}
                              aria-label="复制分享页链接"
                              title="复制分享页链接"
                            >
                              {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                            </ActionIcon>
                          )}
                        </CopyButton>
                      </Group>
                    </Table.Td>
                    <Table.Td>{link.has_password ? '是' : '否'}</Table.Td>
                    <Table.Td>{formatExpire(link.expire_at)}</Table.Td>
                    <Table.Td>{formatAccess(link.access_count, link.max_access_count)}</Table.Td>
                    <Table.Td>
                      <Text size="xs" c={link.is_active ? 'teal' : 'red'}>
                        {link.is_active ? '生效中' : '已停用'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={link.is_active ? 'yellow' : 'teal'}
                          onClick={() => handleToggle(link.id)}
                          aria-label={link.is_active ? '停用分享链接' : '启用分享链接'}
                          title={link.is_active ? '停用分享链接' : '启用分享链接'}
                        >
                          {link.is_active ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => handleRevoke(link.id)}
                          aria-label="撤销分享链接"
                          title="撤销分享链接"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        )}
      </Stack>
    </Modal>
  )
}
