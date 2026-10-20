import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconShield, IconShieldOff, IconTrash, IconUserOff, IconUserCheck } from '@tabler/icons-react'
import { useAppContext } from '../appContext'
import * as driveApi from '../lib/driveApi'
import type { AdminUser } from '../types/node'

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

export function AdminUsersPage() {
  const { isAdmin } = useAppContext()
  const [users, setUsers] = useState<AdminUser[]>([])

  const load = useCallback(() => {
    driveApi.listAdminUsers().then(setUsers).catch(() => {})
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  if (!isAdmin) return <Navigate to="/" replace />

  const handleToggleAdmin = async (u: AdminUser) => {
    try {
      await driveApi.updateAdminUser(u.id, { is_admin: !u.is_admin })
      load()
    } catch { /* interceptor */ }
  }

  const handleToggleActive = async (u: AdminUser) => {
    try {
      await driveApi.updateAdminUser(u.id, { is_active: !u.is_active })
      load()
      notifications.show({
        color: 'green',
        message: u.is_active ? '用户已禁用' : '用户已启用',
      })
    } catch { /* interceptor */ }
  }

  const handleDelete = (u: AdminUser) => {
    modals.openConfirmModal({
      title: '删除用户',
      children: (
        <Text size="sm">
          确定删除用户「{u.username}」？其所有文件和数据将被永久清除，不可恢复。
        </Text>
      ),
      labels: { confirm: '删除', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await driveApi.deleteAdminUser(u.id)
          load()
          notifications.show({ color: 'green', message: '用户已删除' })
        } catch { /* interceptor */ }
      },
    })
  }

  return (
    <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
      <Title order={4} mb="md">用户管理</Title>

      <Table
        striped
        highlightOnHover
        withTableBorder
        withColumnBorders
        style={{ width: '100%', tableLayout: 'auto' }}
      >
        <Table.Thead>
          <Table.Tr>
            <Th>用户名</Th>
            <Th w={100}>角色</Th>
            <Th w={100}>状态</Th>
            <Th w={80}>文件数</Th>
            <Th w={120}>存储</Th>
            <Th w={180}>注册时间</Th>
            <Th w={140}>操作</Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((u) => (
            <Table.Tr key={u.id} opacity={u.is_active ? 1 : 0.5}>
              <Table.Td><Text size="sm">{u.username}</Text></Table.Td>
              <Table.Td>
                <Badge color={u.is_admin ? 'blue' : 'gray'} variant="light" size="sm">
                  {u.is_admin ? '管理员' : '普通用户'}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Badge color={u.is_active ? 'teal' : 'red'} variant="light" size="sm">
                  {u.is_active ? '正常' : '已禁用'}
                </Badge>
              </Table.Td>
              <Table.Td>{u.file_count}</Table.Td>
              <Table.Td>{formatBytes(u.storage)}</Table.Td>
              <Table.Td>{new Date(u.created_at).toLocaleString()}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    onClick={() => handleToggleAdmin(u)}
                    title={u.is_admin ? '撤销管理员' : '设为管理员'}
                  >
                    {u.is_admin ? <IconShieldOff size={16} /> : <IconShield size={16} />}
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={u.is_active ? 'yellow' : 'teal'}
                    onClick={() => handleToggleActive(u)}
                    title={u.is_active ? '禁用' : '启用'}
                  >
                    {u.is_active ? <IconUserOff size={16} /> : <IconUserCheck size={16} />}
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => handleDelete(u)}
                    title="删除"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  )
}
