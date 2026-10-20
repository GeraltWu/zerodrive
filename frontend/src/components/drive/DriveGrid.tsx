import { useState } from 'react'
import { ActionIcon, Box, Image, Paper, SimpleGrid, Text } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import type { DriveNode } from '../../types/node'
import { FileTypeIcon } from '../../lib/fileTypeIcon'
import { IMAGE_EXTENSIONS } from '../../lib/fileTypes'
import * as driveApi from '../../lib/driveApi'

function isImageFilename(name: string): boolean {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i >= name.length - 1) return false
  return IMAGE_EXTENSIONS.has(name.slice(i + 1).toLowerCase())
}

type GridSize = 'small' | 'large'

const gridLayout: Record<GridSize, { cols: Record<string, number>; iconSize: number; thumbSize: number }> = {
  small: { cols: { base: 4, xs: 5, sm: 6, md: 8, lg: 10 }, iconSize: 28, thumbSize: 200 },
  large: { cols: { base: 3, xs: 4, sm: 5, md: 6, lg: 8 }, iconSize: 48, thumbSize: 200 },
}

function GridThumbnail({ node, gridSize }: { node: DriveNode; gridSize: GridSize }) {
  const [imgError, setImgError] = useState(false)
  const { iconSize, thumbSize } = gridLayout[gridSize]

  if (node.is_folder) {
    return <FileTypeIcon node={node} size={iconSize} />
  }

  if (isImageFilename(node.name) && !imgError) {
    return (
      <Image
        src={driveApi.thumbnailUrl(node.id, thumbSize)}
        fit="cover"
        w="100%"
        h="100%"
        onError={() => setImgError(true)}
      />
    )
  }

  return <FileTypeIcon node={node} size={iconSize} />
}

interface DriveGridProps {
  nodes: DriveNode[]
  selectedIds: Set<string>
  size: GridSize
  onRowClick: (e: React.MouseEvent, node: DriveNode) => void
  onRowContextMenu: (e: React.MouseEvent, node: DriveNode) => void
  onRowDoubleClick: (e: React.MouseEvent, node: DriveNode) => void
  mobile: boolean
}

export function DriveGrid({
  nodes,
  selectedIds,
  size,
  onRowClick,
  onRowContextMenu,
  onRowDoubleClick,
  mobile,
}: DriveGridProps) {
  const { cols } = gridLayout[size]

  return (
    <SimpleGrid cols={cols}>
      {nodes.map((node) => (
        <Paper
          key={node.id}
          withBorder
          p={size === 'small' ? 6 : 'xs'}
          style={{
            cursor: 'pointer',
            position: 'relative',
            backgroundColor: selectedIds.has(node.id)
              ? 'var(--mantine-color-blue-0)'
              : undefined,
          }}
          onClick={(e) => mobile ? onRowDoubleClick(e, node) : onRowClick(e, node)}
          onDoubleClick={mobile ? undefined : (e) => onRowDoubleClick(e, node)}
          onContextMenu={(e) => onRowContextMenu(e, node)}
        >
          {mobile && (
            <ActionIcon
              size="sm"
              variant="filled"
              color="gray"
              aria-label={`更多操作：${node.name}`}
              style={{ position: 'absolute', top: 4, right: 4, zIndex: 1, opacity: 0.85 }}
              onClick={(e) => {
                e.stopPropagation()
                onRowContextMenu(e, node)
              }}
            >
              <IconDots size={16} />
            </ActionIcon>
          )}
          <Box
            style={{
              aspectRatio: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <GridThumbnail node={node} gridSize={size} />
          </Box>
          <Text truncate size="xs" ta="center" mt={size === 'small' ? 2 : 4} lh={1.3}>
            {node.name}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  )
}
