import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Group,
  Pagination,
  Select,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconDownload, IconFolderPlus } from '@tabler/icons-react'
import * as driveApi from '../lib/driveApi'
import type { AccessLog } from '../types/node'

const PAGE_SIZE = 50

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

function formatBytes(n: number | null): string {
  if (n === null) return ''
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

function describe(log: AccessLog): string {
  const user = log.visitor_name || '匿名用户'
  const node = log.node_name
  if (log.action === 'join') return `${user} 加入了「${node}」`
  return `${user} 下载了「${node}」`
}

const actionIcons: Record<string, typeof IconDownload> = {
  download: IconDownload,
  join: IconFolderPlus,
}

export function AccessLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<{ items: AccessLog[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(false)

  const shareToken = searchParams.get('share_token') || ''
  const action = searchParams.get('action') || ''
  const page = Number(searchParams.get('page') || '1')
  const sort = (searchParams.get('sort') || 'desc') as 'asc' | 'desc'

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  const load = useCallback(() => {
    setLoading(true)
    driveApi
      .listAccessLogs({
        shareToken: shareToken || undefined,
        action: action || undefined,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        sort,
      })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shareToken, action, page, sort])

  useEffect(() => {
    const frame = requestAnimationFrame(load)
    return () => cancelAnimationFrame(frame)
  }, [load])

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    if (key !== 'page') next.delete('page') // reset page on filter change
    setSearchParams(next, { replace: true })
  }

  const toggleSort = () => setParam('sort', sort === 'desc' ? 'asc' : 'desc')

  const SortIcon = sort === 'desc' ? IconArrowDown : IconArrowUp

  return (
    <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
      <Title order={4} mb="sm">访问记录</Title>

      {/* Filters */}
      <Group mb="sm" gap="sm" wrap="wrap">
        <Select
          size="sm"
          data={[
            { label: '全部链接', value: '' },
            ...(shareToken ? [{ label: `链接 /s/${shareToken.slice(0, 10)}…`, value: shareToken }] : []),
          ]}
          value={shareToken}
          onChange={(v) => setParam('share_token', v ?? '')}
          allowDeselect={false}
          style={{ width: 220 }}
        />
        <Select
          size="sm"
          data={[
            { label: '全部操作', value: '' },
            { label: '下载', value: 'download' },
            { label: '加入', value: 'join' },
          ]}
          value={action}
          onChange={(v) => setParam('action', v ?? '')}
          allowDeselect={false}
          style={{ width: 130 }}
        />
        {shareToken && (
          <Text size="xs" c="dimmed" style={{ lineHeight: '36px' }}>
            {data.total} 条记录
          </Text>
        )}
      </Group>

      {data.items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          {loading ? '加载中…' : '暂无访问记录'}
        </Text>
      ) : (
        <>
          <Table
            striped
            highlightOnHover
            withTableBorder
            withColumnBorders
            style={{ width: '100%', tableLayout: 'auto' }}
          >
            <Table.Thead>
              <Table.Tr>
                <Th w={180}>
                  <Group gap={4} wrap="nowrap" onClick={toggleSort} style={{ cursor: 'pointer' }}>
                    <Text span inherit>时间</Text>
                    <SortIcon size={14} />
                  </Group>
                </Th>
                <Th>操作</Th>
                <Th>文件</Th>
                <Th>链接</Th>
                <Th w={100}>大小</Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((log) => {
                const Icon = actionIcons[log.action] ?? IconDownload
                return (
                  <Table.Tr key={log.id}>
                    <Table.Td>{new Date(log.created_at).toLocaleString()}</Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        <Icon size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                        {describe(log)}
                      </Text>
                    </Table.Td>
                    <Table.Td><Text size="sm">{log.node_name}</Text></Table.Td>
                    <Table.Td>
                      {log.share_token ? (
                        <Text size="sm">/s/{log.share_token}</Text>
                      ) : (
                        <Text size="sm" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>{log.size != null ? formatBytes(log.size) : '—'}</Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>

          {totalPages > 1 && (
            <Group justify="center" mt="sm">
              <Pagination
                total={totalPages}
                value={page}
                onChange={(p) => setParam('page', String(p))}
                size="sm"
              />
            </Group>
          )}
        </>
      )}
    </Box>
  )
}
