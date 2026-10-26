# 部署到公网 · 静态托管指南

本项目是**纯静态、无构建**的网站：`index.html` + `styles.css` + `src/` + `vendor/` 就是全部运行时文件。
把它原样上传到任意静态托管（GitHub Pages / Netlify / Vercel / Cloudflare Pages），就能得到一个可分享的网址。

> 建议直接上传 `muscle-atlas/deploy/` 目录里的内容（这是已经打包好的「站点根目录」，只含运行时文件 + 托管配置）。
> 或者把 `muscle-atlas/muscle-atlas-deploy.zip` 拖给 Netlify Drop 即可，30 秒上线。

---

## 0. 先本地预览（确认没问题再上传）

```bat
"C:\Users\ab130\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" -m http.server 8788 --bind 127.0.0.1 --directory "C:\Users\ab130\Documents\deepseek-harness\default-workspace\muscle-atlas\deploy"
```

然后打开 <http://127.0.0.1:8788/>。

---

## 1. Netlify（最快，拖拽即上线）

1. 打开 <https://app.netlify.com/drop>（注册免费账号）。
2. 把 `muscle-atlas/deploy/` 文件夹（或 `muscle-atlas-deploy.zip`）拖进页面。
3. 几秒后得到一个 `https://随机名.netlify.app` 网址；在站点设置里可改名、绑定自定义域名。
4. 已内置 `netlify.toml`：`publish = "."`，并为 `vendor/` 设置长缓存。
   如果走 Git 仓库部署（推荐，可自动更新）：仓库根目录 = `deploy/` 的内容，Build command 留空，Publish directory 填 `.`。

注意：拖拽上传是一次性快照；以后改文件要重新拖，或改用 Git 部署。

---

## 2. Vercel（拖拽或 CLI）

**方式 A：网页拖拽**

1. 登录 <https://vercel.com>，Add New → Project → 选择 "Deploy without Git"（或直接拖文件夹到 New Project 页面）。
2. Framework Preset 选 **Other**，Build Command 留空，Output Directory 填 `.`。
3. 部署完成得到 `https://项目名.vercel.app`。

**方式 B：命令行**

```bat
npm i -g vercel
cd "C:\Users\ab130\Documents\deepseek-harness\default-workspace\muscle-atlas\deploy"
vercel --prod
```

已内置 `vercel.json`（仅为 `vendor/` 加缓存头，无构建步骤）。

---

## 3. GitHub Pages（免费、永久、可自动更新）

### 3.1 建仓库并上传

1. 在 GitHub 新建仓库（例如 `muscle-atlas`，Public）。
2. 把 `muscle-atlas/deploy/` **里面的内容**上传到仓库根目录（网页上传、GitHub Desktop、或命令行都行）。
   用命令行的话：

   ```bat
   cd "C:\Users\ab130\Documents\deepseek-harness\default-workspace\muscle-atlas\deploy"
   git init
   git add -A
   git commit -m "muscle atlas"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/muscle-atlas.git
   git push -u origin main
   ```

3. 仓库 **Settings → Pages**：
   - Source 选 **Deploy from a branch**
   - Branch 选 `main`，目录选 `/(root)`，Save。
4. 1–2 分钟后访问 `https://<你的用户名>.github.io/muscle-atlas/`。

`.nojekyll` 已包含，避免 GitHub Pages 用 Jekyll 处理文件。

### 3.2 用内置的 Actions 工作流（可选）

`deploy/.github/workflows/deploy-pages.yml` 已写好。用它的话：
Settings → Pages → Source 选 **GitHub Actions**，之后每次 `push` 到 `main` 自动发布。
（两种方式二选一，不要同时开，否则会互相覆盖。）

---

## 4. Cloudflare Pages（免费、国内访问相对快）

1. 登录 <https://pages.cloudflare.com>，Create a project → **Direct Upload**。
2. 把 `muscle-atlas/deploy/` 拖进去，Deploy。
3. 得到 `https://项目名.pages.dev`；支持自定义域名。

---

## 5. 部署后自检清单

- [ ] 打开首页能看到 3D 人体与左侧「25 块肌肉」列表
- [ ] 点击胸大肌：模型聚焦、右侧出现解剖信息与 4 个动作卡
- [ ] 切换「背面」：相机转到背侧，背阔肌/竖脊肌/臀大肌可见
- [ ] 直接访问带哈希的深链接（如 `https://你的域名/#m=pectoralis-major`）能定位到胸大肌
- [ ] 刷新页面后仍正常（哈希路由不需要服务器 rewrite）
- [ ] 手机打开不横向溢出

---

## 6. 常见问题

**需要配置 rewrite / SPA fallback 吗？**
不需要。本项目用 `#hash` 路由（`#m=<肌肉ID>&view=<视角>`），哈希不发送到服务器，所以任何静态托管都能直接工作。

**按子路径部署（如 `https://user.github.io/muscle-atlas/`）会白屏吗？**
不会。所有资源都是相对路径（`vendor/...`、`src/...`），任意子目录都能用。

**更新站点内容怎么办？**
改完 `muscle-atlas/` 里的源文件后，重新生成 `deploy/` 与 zip（见项目 README「部署」一节），再重新上传 / push。

**自定义域名 / HTTPS？**
Netlify / Vercel / Cloudflare Pages 都在项目设置里支持绑定域名并自动签发 HTTPS 证书；GitHub Pages 在 Settings → Pages → Custom domain 绑定。

**国内访问慢？**
GitHub Pages 与 Vercel 默认线路在国内可能不稳定；Netlify/Cloudflare 的 `*.pages.dev` 通常更顺。三者都提供免费额度，可按需切换。
