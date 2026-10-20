import type { CSSProperties } from 'react'
import type { TablerIcon } from '@tabler/icons-react'
import {
  IconArchive,
  IconCode,
  IconFile,
  IconFileSpreadsheet,
  IconFileText,
  IconFileTypePdf,
  IconFolder,
  IconMusic,
  IconPhoto,
  IconPresentation,
  IconVideo,
} from '@tabler/icons-react'
import type { DriveNode } from '../types/node'
import { IMAGE_EXTENSIONS } from './fileTypes'

type MantineColorName =
  | 'gray'
  | 'red'
  | 'pink'
  | 'grape'
  | 'violet'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'yellow'
  | 'orange'

function extOf(name: string): string {
  const t = name.trim()
  const i = t.lastIndexOf('.')
  if (i <= 0 || i >= t.length - 1) return ''
  return t.slice(i + 1).toLowerCase()
}

const AUDIO = new Set([
  'mp3',
  'wav',
  'flac',
  'aac',
  'm4a',
  'ogg',
  'oga',
  'opus',
  'wma',
  'aiff',
  'alac',
  'ape',
])

const VIDEO = new Set([
  'mp4',
  'm4v',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'mpeg',
  'mpg',
  '3gp',
  'ts',
])

const CODE = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'cc',
  'cxx',
  'hpp',
  'cs',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'cmd',
  'vue',
  'svelte',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'graphql',
  'dart',
  'lua',
  'r',
  'pl',
  'pm',
])

const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'lz4', 'zst'])

const SLIDE = new Set(['ppt', 'pptx', 'key'])

const SHEET = new Set(['xls', 'xlsx', 'ods', 'csv'])

const DOC = new Set(['doc', 'docx', 'odt', 'rtf'])

const TEXT = new Set(['txt', 'log', 'md', 'markdown', 'ini', 'cfg', 'env'])

function visualFor(node: DriveNode): { Icon: TablerIcon; color: MantineColorName } {
  if (node.is_folder) return { Icon: IconFolder, color: 'yellow' }

  const ext = extOf(node.name || '')

  if (AUDIO.has(ext)) return { Icon: IconMusic, color: 'violet' }
  if (VIDEO.has(ext)) return { Icon: IconVideo, color: 'pink' }
  if (IMAGE_EXTENSIONS.has(ext)) return { Icon: IconPhoto, color: 'cyan' }
  if (ext === 'pdf') return { Icon: IconFileTypePdf, color: 'red' }
  if (SLIDE.has(ext)) return { Icon: IconPresentation, color: 'orange' }
  if (SHEET.has(ext)) return { Icon: IconFileSpreadsheet, color: 'green' }
  if (DOC.has(ext)) return { Icon: IconFileText, color: 'blue' }
  if (TEXT.has(ext)) return { Icon: IconFileText, color: 'gray' }
  if (ARCHIVE.has(ext)) return { Icon: IconArchive, color: 'grape' }
  if (CODE.has(ext)) return { Icon: IconCode, color: 'indigo' }

  return { Icon: IconFile, color: 'gray' }
}

export function FileTypeIcon({
  node,
  size = 18,
  style,
}: {
  node: DriveNode
  size?: number
  style?: CSSProperties
}) {
  const { Icon, color } = visualFor(node)
  return (
    <Icon
      size={size}
      style={{
        flexShrink: 0,
        color: `var(--mantine-color-${color}-6)`,
        ...style,
      }}
      aria-hidden
    />
  )
}
