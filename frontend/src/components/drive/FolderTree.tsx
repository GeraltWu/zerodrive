import { useState } from 'react'
import { ActionIcon, Box, Group, UnstyledButton } from '@mantine/core'
import { IconChevronRight, IconFolder } from '@tabler/icons-react'
import { useDroppable } from '@dnd-kit/core'
import type { FolderTreeItem, FolderTreeNode } from '../../types/node'

type DropTargetType = 'tree'

function buildTree(flat: FolderTreeItem[], rootId: string): FolderTreeNode {
  const byParent = new Map<string, FolderTreeItem[]>()
  for (const f of flat) {
    const pid = f.parent_id === null || f.parent_id === undefined ? null : f.parent_id
    const key = pid === null ? '__null__' : pid
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push({ ...f, parent_id: pid })
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  function toNode(item: FolderTreeItem): FolderTreeNode {
    const kids = byParent.get(item.id) ?? []
    return {
      id: item.id,
      parent_id: item.parent_id,
      name: item.name,
      children: kids.map(toNode),
    }
  }

  const root = flat.find((f) => f.id === rootId)
  if (!root) {
    return { id: rootId, parent_id: null, name: '', children: [] }
  }
  return toNode(root)
}

function subtreeContains(node: FolderTreeNode, selectedId: string): boolean {
  if (node.id === selectedId) return true
  return node.children.some((c) => subtreeContains(c, selectedId))
}

function TreeBranch({
  node,
  rootId,
  selectedId,
  onSelect,
  draggingNodeId,
  depth,
}: {
  node: FolderTreeNode
  rootId: string
  selectedId: string
  onSelect: (id: string) => void
  draggingNodeId: string | null
  depth: number
}) {
  const hasChildren = node.children.length > 0
  const containsSel = subtreeContains(node, selectedId)
  const [manuallyOpened, setManuallyOpened] = useState(() => containsSel)
  const opened = containsSel || manuallyOpened

  const label =
    node.id === rootId ? '全部文件' : node.name || '文件夹'
  const { setNodeRef: setDropNodeRef, isOver: isDropOver } = useDroppable({
    id: `tree-folder:${node.id}`,
    disabled: draggingNodeId === node.id,
    data: {
      dropType: 'tree' as DropTargetType,
    },
  })

  return (
    <Box>
      <Group
        ref={setDropNodeRef}
        gap={4}
        wrap="nowrap"
        pl={depth * 12}
        align="center"
        style={{
          borderRadius: 6,
          backgroundColor: isDropOver ? 'var(--mantine-color-blue-light)' : undefined,
        }}
      >
        {hasChildren ? (
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={opened ? '折叠' : '展开'}
            onClick={(e) => {
              e.stopPropagation()
              setManuallyOpened((o) => !o)
            }}
          >
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? 'rotate(90deg)' : undefined,
                transition: 'transform 100ms ease',
              }}
            />
          </ActionIcon>
        ) : (
          <Box w={28} />
        )}
        <UnstyledButton
          onClick={() => onSelect(node.id)}
          style={{
            flex: 1,
            textAlign: 'left',
            borderRadius: 4,
            padding: '4px 6px',
            fontWeight: node.id === selectedId ? 600 : 400,
            background:
              node.id === selectedId
                ? 'var(--mantine-color-blue-light)'
                : undefined,
          }}
        >
          <Group gap={6} wrap="nowrap">
            <IconFolder size={16} style={{ flexShrink: 0, opacity: 0.85 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </span>
          </Group>
        </UnstyledButton>
      </Group>
      {hasChildren && opened ? (
        <Box>
          {node.children.map((ch) => (
            <TreeBranch
              key={ch.id}
              node={ch}
              rootId={rootId}
              selectedId={selectedId}
              onSelect={onSelect}
              draggingNodeId={draggingNodeId}
              depth={depth + 1}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

export function FolderTree({
  flat,
  rootId,
  selectedId,
  onSelect,
  draggingNodeId,
}: {
  flat: FolderTreeItem[]
  rootId: string
  selectedId: string
  onSelect: (id: string) => void
  draggingNodeId: string | null
}) {
  const tree = buildTree(flat, rootId)

  return (
    <Box
      miw={0}
      style={{ overflowX: 'hidden' }}
    >
      <TreeBranch
        node={tree}
        rootId={rootId}
        selectedId={selectedId}
        onSelect={onSelect}
        draggingNodeId={draggingNodeId}
        depth={0}
      />
    </Box>
  )
}
