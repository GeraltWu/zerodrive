export interface DriveNode {
  id: string
  parent_id: string | null
  name: string
  is_folder: boolean
  size: number
  mime_type: string | null
  meta_json: Record<string, unknown> | null
  owner_id: string | null
  owner_username: string | null
  updated_at: string
}

export interface DownloadManifestItem {
  node_id: string
  path: string
  size: number
}

export interface Collaborator {
  id: string
  folder_id: string
  user_id: string
  username: string
  role: string
  created_at: string
}

export interface SharedFolder {
  folder_id: string
  folder_name: string
  role: string
}

export interface BreadcrumbItem {
  id: string
  name: string
}

export interface FolderTreeItem {
  id: string
  parent_id: string | null
  name: string
}

export interface FolderTreeNode extends FolderTreeItem {
  children: FolderTreeNode[]
}

export interface ShareLink {
  id: string
  node_id: string
  token: string
  has_password: boolean
  is_active: boolean
  expire_at: string | null
  max_access_count: number | null
  access_count: number
  created_at: string
}

export interface ShareLinkWithNode extends ShareLink {
  node_name: string
  is_folder: boolean
}

export interface AccessLog {
  id: string
  node_id: string
  node_name: string
  is_folder: boolean
  action: string
  visitor_name: string
  share_token: string
  size: number | null
  created_at: string
}

export interface AdminUser {
  id: string
  username: string
  is_admin: boolean
  is_active: boolean
  file_count: number
  storage: number
  created_at: string
}

export interface AccessLogPage {
  items: AccessLog[]
  total: number
}

export interface ShareLinkPublicInfo {
  node_name: string
  is_folder: boolean
  size: number
  mime_type: string | null
  has_password: boolean
}
