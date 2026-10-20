import { useOutletContext } from 'react-router-dom'

import type { PreviewData } from './components/drive/PreviewPanel'
import type { UploadItem } from './components/drive/DriveContentPane'
import type { DriveNode } from './types/node'

export type AppContext = {
  isMobile: boolean
  isAdmin: boolean
  sidebarOpen: boolean
  toggleSidebar: () => void
  preview: PreviewData | null
  setPreview: (preview: PreviewData | null) => void
  previewCollapsed: boolean
  setPreviewCollapsed: (collapsed: boolean) => void
  mediaFiles: DriveNode[]
  setMediaFiles: (files: DriveNode[]) => void
  uploadItems: UploadItem[]
  setUploadItems: (items: UploadItem[] | ((previous: UploadItem[]) => UploadItem[])) => void
  onRemoveUploadItem: (id: string) => void
}

export function useAppContext() {
  return useOutletContext<AppContext>()
}
