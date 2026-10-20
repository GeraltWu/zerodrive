import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Anchor,
  Button,
  Center,
  Container,
  Loader,
  Paper,
  PasswordInput,
  Text,
  Title,
} from '@mantine/core'
import { IconDownload, IconFolder, IconLock, IconLogin } from '@tabler/icons-react'
import * as driveApi from '../lib/driveApi'
import { FileTypeIcon } from '../lib/fileTypeIcon'
import type { ShareLinkPublicInfo, DriveNode } from '../types/node'

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

export function PublicSharePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<ShareLinkPublicInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    driveApi.hasActiveSession().then(setLoggedIn).catch(() => setLoggedIn(false))
  }, [])

  useEffect(() => {
    if (!token) return
    let active = true
    const frame = requestAnimationFrame(() => {
      setLoading(true)
      setError(null)
      driveApi
        .getPublicShareInfo(token)
        .then((info) => {
          if (!active) return
          setInfo(info)
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (!active) return
          setError(err instanceof Error ? err.message : '分享链接访问失败')
          setLoading(false)
        })
    })
    return () => {
      active = false
      cancelAnimationFrame(frame)
    }
  }, [token])

  const handleVerifyPassword = async () => {
    if (!token || !password) return
    setVerifying(true)
    setPasswordError(false)
    try {
      const result = await driveApi.verifySharePassword(token, password)
      setAccessToken(result.access_token)
    } catch {
      setPasswordError(true)
    } finally {
      setVerifying(false)
    }
  }

  const handleDownload = () => {
    if (!token) return
    setDownloading(true)
    const url = driveApi.shareDownloadUrl(token, accessToken ?? undefined)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => setDownloading(false), 1000)
  }

  const handleJoin = async () => {
    if (!token) return
    setJoining(true)
    try {
      await driveApi.joinShareFolder(token, accessToken ?? undefined)
      setJoined(true)
    } catch {
      /* shown by api interceptor */
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (error || !info) {
    return (
      <Center h="100vh">
        <Paper p="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
          <Title order={4} c="red" mb="md">
            无法访问
          </Title>
          <Text size="sm" c="dimmed">
            {error || '分享链接不存在'}
          </Text>
        </Paper>
      </Center>
    )
  }

  const needsPassword = info.has_password && !accessToken

  return (
    <Center h="100vh" bg="var(--mantine-color-gray-light)">
      <Container size="xs" w="100%">
        <Paper p="xl" radius="md" shadow="md" withBorder>
          {needsPassword ? (
            <>
              <Center mb="md">
                <IconLock size={48} color="var(--mantine-color-gray-5)" />
              </Center>
              <Title order={4} ta="center" mb="xs">
                需要密码
              </Title>
              <Text size="sm" c="dimmed" ta="center" mb="md">
                此分享链接已设置密码保护
              </Text>
              <PasswordInput
                placeholder="输入访问密码"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                error={passwordError ? '密码错误' : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerifyPassword()
                }}
                mb="sm"
              />
              <Button fullWidth loading={verifying} onClick={handleVerifyPassword}>
                验证
              </Button>
            </>
          ) : info.is_folder ? (
            <>
              <Center mb="md">
                <IconFolder size={48} color="var(--mantine-color-yellow-6)" />
              </Center>
              <Title order={4} ta="center" mb="xs">
                {info.node_name}
              </Title>
              <Text size="sm" c="dimmed" ta="center" mb="md">
                文件夹 · 加入后可在「与我共享」中访问
              </Text>
              {!loggedIn ? (
                <>
                  <Button
                    fullWidth
                    mb="sm"
                    leftSection={<IconLogin size={18} />}
                    component="a"
                    href="/login"
                  >
                    登录以加入
                  </Button>
                  <Text size="xs" c="dimmed" ta="center">
                    没有账号？
                    <Anchor size="xs" href="/register">
                      立即注册
                    </Anchor>
                  </Text>
                </>
              ) : joined ? (
                <>
                  <Button fullWidth onClick={() => navigate('/')}>
                    前往 ZeroDrive
                  </Button>
                  <Text size="xs" c="teal" ta="center" mt="sm">
                    已加入此文件夹，可在「与我共享」中查看
                  </Text>
                </>
              ) : (
                <Button
                  fullWidth
                  loading={joining}
                  onClick={handleJoin}
                  leftSection={<IconFolder size={18} />}
                >
                  加入此文件夹
                </Button>
              )}
            </>
          ) : (
            <>
              <Center mb="md">
                <FileTypeIcon
                  node={{ name: info.node_name, mime_type: info.mime_type } as DriveNode}
                  size={48}
                />
              </Center>
              <Title order={4} ta="center" mb="xs">
                {info.node_name}
              </Title>
              <Text size="sm" c="dimmed" ta="center" mb="md">
                {`${formatBytes(info.size)}${info.mime_type ? ` · ${info.mime_type}` : ''}`}
              </Text>
              <Button
                fullWidth
                leftSection={<IconDownload size={18} />}
                loading={downloading}
                onClick={handleDownload}
              >
                下载文件
              </Button>
            </>
          )}
        </Paper>
      </Container>
    </Center>
  )
}
