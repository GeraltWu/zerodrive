# ZeroDrive

自用网盘，做着玩的

## 已实现

- 文件列表 / 网格（小图标 / 大图标）查看模式
- 多列排序（名称、大小、修改时间），列表表头点击排序
- 缩略图预览（图片网格模式下使用服务端缩略图接口）
- 文件夹协作（邀请用户为 viewer / editor / admin）
- Bot 随机文件接口（支持 image / audio / video，精确文件匹配或文件夹内随机）

## 启动命令

```bash
# 终端 1 — 后端
cd backend
conda activate zero_drive
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 终端 2 — 前端
cd frontend
npm run dev
```

首次运行需先迁移数据库：

```bash
cd backend
conda activate zero_drive
python scripts/migrate.py
```

## Docker 部署

使用宝塔面板、Docker Compose、HTTPS 反向代理部署时，参见 [ZeroDrive 宝塔面板 Docker 部署](docs/DEPLOY_BAOTA.md)。

## 新功能
1. 添加最左边工具栏，放置需要切换页面的功能
2. 记忆当前打开的目录，从其他页面跳转或者刷新时不要重置
3. 复制粘贴：现在只有移动，加 Ctrl+C / Ctrl+V 拷贝文件
4. 收藏夹：文件/文件夹标星，侧边栏固定入口，和"与我共享"同级
5. 全文搜索：按文件名搜索（现在得手动找 。
6. 上传队列：显示上传列表，支持取消单个。
7. 生成公开链接：区别于"协作"，生成 /s/<token> 链接，不需要登录就能预览/下载可设密码、过期时间、访问次数限制
8. 暗色模式：Mantine 原生支持，加个开关就行
9. 访问记录：文件被分享链接下载 → 记一条（user 为 null，保留 token 信息），用户通过链接加入文件夹 → 记一条（user 为加入者）
10. 移动端适配：响应式布局，手机上也能浏览
