#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_deploy.py — 生成可直接上传到静态托管的发布包。

产物：
  muscle-atlas/deploy/                    站点根目录（index.html + styles.css + src/ + vendor/ + 托管配置）
  muscle-atlas/muscle-atlas-deploy.zip    同上的 zip（可拖拽到 Netlify Drop / Vercel）

用法：
  python tools/build_deploy.py
"""
import io
import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'deploy')
TEMPLATES = os.path.join(ROOT, 'tools', 'deploy-templates')
ZIP_PATH = os.path.join(ROOT, 'muscle-atlas-deploy.zip')

# 运行时需要的文件 / 目录（相对项目根）
RUNTIME = [
    'index.html',
    'styles.css',
    'src',
    'vendor',
]

# 模板 -> 发布包内路径（.nojekyll 由脚本直接创建）
TEMPLATE_MAP = [
    ('netlify.toml', 'netlify.toml'),
    ('vercel.json', 'vercel.json'),
    (os.path.join('.github', 'workflows', 'deploy-pages.yml'),
     os.path.join('.github', 'workflows', 'deploy-pages.yml')),
]


def reset_dir(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path)


def main():
    if not os.path.isfile(os.path.join(ROOT, 'index.html')):
        print('ERROR: index.html not found; run from muscle-atlas project root')
        return 1

    reset_dir(DEST)

    file_count = 0
    total_bytes = 0
    for rel in RUNTIME:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(DEST, rel)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
            for base, _dirs, files in os.walk(dst):
                for f in files:
                    file_count += 1
                    total_bytes += os.path.getsize(os.path.join(base, f))
        elif os.path.isfile(src):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            file_count += 1
            total_bytes += os.path.getsize(dst)
        else:
            print('ERROR: missing runtime file: ' + rel)
            return 1

    for tmpl_rel, out_rel in TEMPLATE_MAP:
        src = os.path.join(TEMPLATES, tmpl_rel)
        if not os.path.isfile(src):
            print('WARN: template missing: ' + tmpl_rel)
            continue
        dst = os.path.join(DEST, out_rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)

    # 空文件 .nojekyll：有些 Windows 工具不喜欢复制空文件，这里确保它存在
    open(os.path.join(DEST, '.nojekyll'), 'w').close()

    # 生成 zip（包含点文件）
    if os.path.isfile(ZIP_PATH):
        os.remove(ZIP_PATH)
    zcount = 0
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for base, _dirs, files in os.walk(DEST):
            for f in sorted(files):
                full = os.path.join(base, f)
                rel = os.path.relpath(full, DEST).replace(os.sep, '/')
                zf.write(full, rel)
                zcount += 1

    print('DEPLOY_OK files=%d bytes=%d' % (file_count, total_bytes))
    print('DEPLOY_DIR %s' % DEST)
    print('ZIP %s entries=%d bytes=%d' % (ZIP_PATH, zcount, os.path.getsize(ZIP_PATH)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
