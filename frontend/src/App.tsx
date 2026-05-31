import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Box, Burger, Button, Drawer, Group, NavLink, Paper, Text, Title, useMantineColorScheme, useMantineTheme } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { Group as PanelGroup, Panel, Separator } from 'react-resizable-panels'
import { IconArrowsMaximize, IconFiles, IconHistory, IconLink, IconMoon, IconShield, IconSun, IconX } from '@tabler/icons-react'
import { AuthGuard } from './components/layout/AuthGuard'
import { AppToolbar } from './components/layout/AppToolbar'
import { DrivePage } from './pages/DrivePage'
import { LoginPage } from './pages/LoginPage'
import { PublicSharePage } from './pages/PublicSharePage'
import { RegisterPage } from './pages/RegisterPage'
import { AccessLogsPage } from './pages/AccessLogsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { ShareLinksPage } from './pages/ShareLinksPage'
import * as driveApi from './lib/driveApi'
import { getMediaPreviewKind } from './lib/mediaPreview'

import type { PreviewData } from './components/drive/PreviewPanel'
import { PreviewPanel } from './components/drive/PreviewPanel'
import type { UploadItem } from './components/drive/DriveContentPane'
import { FloatingUploadPanel } from './components/drive/FloatingUploadPanel'
import type { DriveNode } from './types/node'

export type AppContext = {
  isMobile: boolean; isAdmin: boolean
  sidebarOpen: boolean; toggleSidebar: () => void
  preview: PreviewData | null; setPreview: (p: PreviewData | null) => void
  previewCollapsed: boolean; setPreviewCollapsed: (v: boolean) => void
  mediaFiles: DriveNode[]; setMediaFiles: (f: DriveNode[]) => void
  uploadItems: UploadItem[]; setUploadItems: (items: UploadItem[] | ((prev: UploadItem[]) => UploadItem[])) => void
  onRemoveUploadItem: (id: string) => void
}

export function useAppContext() { return useOutletContext<AppContext>() }

const navItems = [
  { path: '/', label: '我的文件', icon: IconFiles },
  { path: '/share-links', label: '分享链接', icon: IconLink },
  { path: '/access-logs', label: '访问记录', icon: IconHistory },
]

function AppLayout() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const theme = useMantineTheme()
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false
  const dark = colorScheme === 'dark'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<DriveNode[]>([])
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const previewPanelRef = useRef<any>(null)
  const onRemoveUploadItem = (id: string) => setUploadItems((prev) => prev.filter((x) => x.id !== id))
  const toggleSidebar = () => setSidebarOpen((v) => !v)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    driveApi.me().then((u) => setIsAdmin(u.is_admin)).catch(() => {})
  }, [])

  const allNav = isAdmin
    ? [...navItems, { path: '/admin/users', label: '用户管理', icon: IconShield }]
    : navItems

  const leftDrawerContent = (
    <Box>
      {allNav.map((t) => (
        <NavLink
          key={t.path}
          label={t.label}
          leftSection={<t.icon size={20} />}
          active={t.path === '/' ? pathname === '/' : pathname.startsWith(t.path)}
          onClick={() => { navigate(t.path); setNavOpen(false) }}
          style={{ borderRadius: 4 }}
        />
      ))}
      <Box mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Button
          fullWidth
          variant="subtle"
          color="red"
          size="xs"
          onClick={async () => {
            await driveApi.logout()
            window.location.href = '/login'
          }}
        >
          退出登录
        </Button>
      </Box>
    </Box>
  )

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Shared header */}
      <Group
        h={56}
        px="md"
        justify="space-between"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Group gap="xs">
          {isMobile && (
            <Burger opened={navOpen} onClick={() => setNavOpen((v) => !v)} size="sm" />
          )}
          <Title order={4}>ZeroDrive</Title>
        </Group>
        <Group gap="xs">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => setColorScheme(dark ? 'light' : 'dark')}
          >
            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
          {isMobile && (
            <Burger opened={sidebarOpen} onClick={toggleSidebar} size="sm" />
          )}
          {!isMobile && (
            <Button
              variant="subtle"
              size="xs"
              onClick={async () => {
                await driveApi.logout()
                window.location.href = '/login'
              }}
            >
              退出
            </Button>
          )}
        </Group>
      </Group>

      {/* Left nav drawer (mobile) */}
      {isMobile && (
        <Drawer
          opened={navOpen}
          onClose={() => setNavOpen(false)}
          size="xs"
          title="ZeroDrive"
          overlayProps={{ backgroundOpacity: 0.4 }}
        >
          {leftDrawerContent}
        </Drawer>
      )}

      {/* Toolbar + content */}
      <Box style={{ flex: '1 1 0%', display: 'flex', minHeight: 0, position: 'relative' }}>
        {!isMobile && <AppToolbar isAdmin={isAdmin} />}
        <PanelGroup orientation="horizontal" style={{ flex: 1, minWidth: 0 }}>
          <Panel defaultSize={preview ? 60 : 100} minSize={35}>
            <Box
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'auto',
              }}
            >
              <Outlet context={{ isMobile, isAdmin, sidebarOpen, toggleSidebar, preview, setPreview, previewCollapsed, setPreviewCollapsed, mediaFiles, setMediaFiles, uploadItems, setUploadItems, onRemoveUploadItem } satisfies AppContext} />
            </Box>
          </Panel>
          {preview && !isMobile && (
            <>
              <Separator
                style={{
                  width: previewCollapsed ? 0 : 6,
                  background: 'var(--mantine-color-default-border)',
                  overflow: 'hidden',
                }}
              />
              <Panel
                defaultSize={40}
                minSize={20}
                collapsible
                collapsedSize={0}
                panelRef={previewPanelRef}
                style={previewCollapsed ? { overflow: 'hidden' } : undefined}
              >
                <PreviewPanel
                  preview={preview}
                  mediaFiles={mediaFiles}
                  onCollapseToggle={() => { previewPanelRef.current?.collapse(); setPreviewCollapsed(true) }}
                  onClose={() => setPreview(null)}
                  onNavigate={(node) => {
                    const k = getMediaPreviewKind(node.name)
                    if (k) {
                      setPreview({ node, kind: k })
                      previewPanelRef.current?.expand()
                      setPreviewCollapsed(false)
                    }
                  }}
                />
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Bottom-right floating cards (stacked) */}
        {(uploadItems.length > 0 || (preview && !isMobile && previewCollapsed)) && (
          <Box
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 300,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {uploadItems.length > 0 && (
              <FloatingUploadPanel items={uploadItems} onRemove={onRemoveUploadItem} />
            )}
            {preview && !isMobile && previewCollapsed && (
              <Paper
                shadow="md"
                radius="md"
                withBorder
                style={{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'color-mix(in srgb, var(--mantine-color-body) 92%, transparent)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => { previewPanelRef.current?.expand(); setPreviewCollapsed(false) }}
                >
                  <IconArrowsMaximize size={16} />
                </ActionIcon>
                <Text size="sm" truncate maw={160}>{preview.node.name}</Text>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setPreview(null)}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/s/:token" element={<PublicSharePage />} />
        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/" element={<DrivePage />} />
          <Route path="/share-links" element={<ShareLinksPage />} />
          <Route path="/access-logs" element={<AccessLogsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
