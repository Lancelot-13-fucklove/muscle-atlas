#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
github_deploy.py — 用 GitHub REST API 把 muscle-atlas 发布成 GitHub Pages 站点。

不需要本地安装 git：直接调 Git Data API 创建仓库、提交文件、开启 Pages。

准备：
  1) 生成 classic Personal Access Token（勾选 repo 权限）
     https://github.com/settings/tokens/new?scopes=repo&description=dsh-muscle-atlas
  2) 把 token 放进环境变量 GH_TOKEN（不要写进命令行参数，避免留在历史里）

用法：
  set GH_TOKEN=ghp_xxx
  python tools\\github_deploy.py --repo muscle-atlas

  # 只看将上传哪些文件，不访问网络
  python tools\\github_deploy.py --dry-run

  # 部署到已存在的仓库（覆盖更新）
  python tools\\github_deploy.py --repo muscle-atlas --update
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = 'https://api.github.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'muscle-atlas-deploy/1.0'

# 让 Windows 控制台/管道里的中文日志不乱码
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 需要上传的运行时文件/目录（相对项目根）
INCLUDE_DIRS = ['src', 'vendor', 'docs', 'tools', 'shots', 'tools/deploy-templates']
INCLUDE_FILES = [
    'index.html',
    'styles.css',
    'README.md',
    '打开.cmd',
    '.gitignore',
]
SHOT_GLOBS = ('screenshot-', 'selftest.png', 'deploy-preview.png')
SKIP_DIR_NAMES = {'deploy', '__pycache__', 'node_modules', '.git'}


def log(msg):
    sys.stdout.write('[deploy] ' + msg + '\n')
    sys.stdout.flush()


def api(method, path, token, payload=None, allow=(200, 201, 204), retries=3):
    """调用 GitHub API，返回 (status, data)。PATH 以 / 开头。"""
    url = API + path
    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': UA,
    }
    if data is not None:
        headers['Content-Type'] = 'application/json; charset=utf-8'

    last_err = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                body = resp.read().decode('utf-8', 'replace')
                out = json.loads(body) if body.strip() else {}
                status = resp.status
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            try:
                out = json.loads(body) if body.strip() else {}
            except ValueError:
                out = {'raw': body[:400]}
            if e.code in allow:
                return e.code, out
            if e.code >= 500 and attempt < retries:
                last_err = 'HTTP %s %s' % (e.code, out)
                time.sleep(1.5 * attempt)
                continue
            raise SystemExit('GitHub API %s %s -> HTTP %s: %s\n%s' % (
                method, path, e.code, out.get('message', out), body[:800]))
        except urllib.error.URLError as e:
            last_err = str(e)
            if attempt < retries:
                time.sleep(1.5 * attempt)
                continue
            raise SystemExit('网络错误 %s %s: %s' % (method, path, last_err))
        if status not in allow:
            raise SystemExit('GitHub API %s %s -> HTTP %s: %s' % (method, path, status, out))
        return status, out
    raise SystemExit('GitHub API %s %s 失败: %s' % (method, path, last_err))


def collect_files():
    """收集需要上传的文件，返回 [(repo_path, local_path)]。"""
    out = []

    def add(rel):
        full = os.path.join(ROOT, rel)
        if os.path.isfile(full) and os.path.getsize(full) < 90 * 1024 * 1024:
            out.append((rel.replace(os.sep, '/'), full))

    for rel in INCLUDE_FILES:
        add(rel)
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for cur, dirs, files in os.walk(base):
            dirs[:] = [x for x in dirs if x not in SKIP_DIR_NAMES]
            for f in sorted(files):
                rel = os.path.relpath(os.path.join(cur, f), ROOT)
                if rel.startswith('shots' + os.sep):
                    if not f.startswith('screenshot-') and f not in ('selftest.png', 'deploy-preview.png'):
                        continue
                add(rel)
    # 去重并排序
    seen = set()
    uniq = []
    for rel, full in out:
        if rel in seen:
            continue
        seen.add(rel)
        uniq.append((rel, full))
    return sorted(uniq, key=lambda x: x[0])


def create_blob(token, owner, repo, local_path):
    with open(local_path, 'rb') as fh:
        content = base64.b64encode(fh.read()).decode('ascii')
    _s, out = api('POST', '/repos/%s/%s/git/blobs' % (owner, repo), token,
                  {'content': content, 'encoding': 'base64'})
    return out['sha']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='muscle-atlas', help='仓库名（默认 muscle-atlas）')
    ap.add_argument('--owner', default='', help='GitHub 用户名（默认用 token 对应账号）')
    ap.add_argument('--branch', default='main')
    ap.add_argument('--private', action='store_true', help='私有仓库（Pages 需要付费账号）')
    ap.add_argument('--update', action='store_true', help='仓库已存在时覆盖更新')
    ap.add_argument('--dry-run', action='store_true', help='只列出将上传的文件')
    ap.add_argument('--no-pages', action='store_true', help='只推代码，不开启 Pages')
    args = ap.parse_args()

    files = collect_files()
    total = sum(os.path.getsize(p) for _r, p in files)
    log('待上传 %d 个文件，共 %.1f KB' % (len(files), total / 1024.0))
    if args.dry_run:
        for rel, full in files:
            log('  %8d  %s' % (os.path.getsize(full), rel))
        return 0

    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if not token:
        raise SystemExit('缺少 GH_TOKEN 环境变量。生成方式: https://github.com/settings/tokens/new?scopes=repo')

    # 1) 身份
    _s, user = api('GET', '/user', token)
    owner = args.owner or user['login']
    if owner.lower() != user['login'].lower():
        raise SystemExit('token 属于 %s，与 --owner %s 不一致' % (user['login'], owner))
    log('账号: %s  仓库: %s (public=%s)' % (owner, args.repo, not args.private))

    # 2) 创建或读取仓库
    status, repo_info = api('POST', '/user/repos', token, {
        'name': args.repo,
        'description': '交互式男性全身肌肉 3D 图谱：25 块肌肉 · 86 个训练动作（three.js，离线可用）',
        'private': bool(args.private),
        'auto_init': False,
        'has_wiki': False,
        'has_projects': False,
    }, allow=(201, 422))

    if status == 422:
        log('仓库已存在，读取现有仓库信息…')
        _s, repo_info = api('GET', '/repos/%s/%s' % (owner, args.repo), token)
        if not args.update:
            log('提示：仓库已存在（加 --update 可覆盖更新文件）')
    else:
        log('仓库已创建: %s' % repo_info.get('html_url', ''))

    # 3) 逐个文件建 blob
    blobs = []
    for i, (rel, full) in enumerate(files, 1):
        sha = create_blob(token, owner, args.repo, full)
        blobs.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': sha})
        if i % 10 == 0 or i == len(files):
            log('  已上传 %d/%d' % (i, len(files)))

    # .nojekyll（空文件）写进仓库根，避免 GitHub Pages 忽略下划线开头资源
    _s, empty = api('POST', '/repos/%s/%s/git/blobs' % (owner, args.repo), token,
                    {'content': '', 'encoding': 'base64'})
    blobs.append({'path': '.nojekyll', 'mode': '100644', 'type': 'blob', 'sha': empty['sha']})

    # 4) 建 tree（已有分支时基于旧 tree，保证覆盖更新）
    base_tree = None
    parent = None
    _s, ref = api('GET', '/repos/%s/%s/git/ref/heads/%s' % (owner, args.repo, args.branch),
                  token, allow=(200, 404, 409))
    if ref and ref.get('object', {}).get('sha'):
        parent = ref['object']['sha']
        _s, commit = api('GET', '/repos/%s/%s/git/commits/%s' % (owner, args.repo, parent), token)
        base_tree = commit['tree']['sha']
        log('基于已有分支 %s（parent=%s）更新' % (args.branch, parent[:7]))
    else:
        log('仓库为空，创建首个提交')

    tree_payload = {'tree': blobs}
    if base_tree:
        tree_payload['base_tree'] = base_tree
    _s, tree = api('POST', '/repos/%s/%s/git/trees' % (owner, args.repo), token, tree_payload)

    # 5) 建 commit
    commit_payload = {'message': 'chore: 部署肌肉训练图谱到 GitHub Pages (%s)' % time.strftime('%Y-%m-%d %H:%M'),
                      'tree': tree['sha']}
    if parent:
        commit_payload['parents'] = [parent]
    _s, commit = api('POST', '/repos/%s/%s/git/commits' % (owner, args.repo), token, commit_payload)

    # 6) 建/更新分支引用
    if parent:
        _s, _r = api('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (owner, args.repo, args.branch), token,
                     {'sha': commit['sha'], 'force': False})
        log('分支 %s 已更新 -> %s' % (args.branch, commit['sha'][:7]))
    else:
        _s, _r = api('POST', '/repos/%s/%s/git/refs' % (owner, args.repo), token,
                     {'ref': 'refs/heads/' + args.branch, 'sha': commit['sha']})
        log('分支 %s 已创建 -> %s' % (args.branch, commit['sha'][:7]))

    html_url = 'https://%s.github.io/%s/' % (owner.lower(), args.repo)
    if args.no_pages:
        log('已跳过 Pages。仓库地址: %s' % repo_info.get('html_url', ''))
        return 0

    # 7) 开启 GitHub Pages（分支 root）
    log('开启 GitHub Pages（%s -> /）…' % args.branch)
    time.sleep(3)
    status, pages = api('POST', '/repos/%s/%s/pages' % (owner, args.repo), token,
                        {'source': {'branch': args.branch, 'path': '/'}},
                        allow=(201, 409, 422))
    if status == 422:
        # 旧版本 API 需要 build_type 或已存在 pages
        status, pages = api('POST', '/repos/%s/%s/pages' % (owner, args.repo), token,
                            {'build_type': 'legacy', 'source': {'branch': args.branch, 'path': '/'}},
                            allow=(201, 409, 422))
    if status == 409:
        log('Pages 已开启，继续等待构建')

    # 8) 轮询健康检查
    log('等待 Pages 构建（首次通常 30~90 秒）…')
    deadline = time.time() + 300
    ok = False
    while time.time() < deadline:
        time.sleep(10)
        try:
            req = urllib.request.Request(html_url, headers={'User-Agent': UA, 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status == 200:
                    body = resp.read(200000).decode('utf-8', 'replace')
                    ok = '肌肉' in body or 'muscle' in body.lower()
                    log('  站点已可访问 (HTTP 200, 内容%s)' % ('正常' if ok else '可能还是 404 页'))
                    if ok:
                        break
        except urllib.error.HTTPError as e:
            log('  等待中… HTTP %s' % e.code)
        except Exception as e:
            log('  等待中… %s' % type(e).__name__)

    log('')
    log('========== 部署完成 ==========')
    log('仓库:  %s' % repo_info.get('html_url', 'https://github.com/%s/%s' % (owner, args.repo)))
    log('站点:  %s' % html_url)
    log('深链接: %s#m=pectoralis-major' % html_url)
    if not ok:
        log('注意：站点尚未返回预期内容，可能仍在构建，请 1 分钟后刷新。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
