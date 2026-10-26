#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""开发工具（不随页面加载）：把 tools/export_geometry.js 导出的三角形用纯软件
(Pillow painter's algorithm) 渲染成预览图，用于在无浏览器环境下检查人体造型。

用法:
  python tools/render_preview.py --view front --out shots/preview_front.png
  python tools/render_preview.py --view back  --out shots/preview_back.png
  python tools/render_preview.py --view left  --out shots/preview_left.png --size 900x1100
  python tools/render_preview.py --view front --out shots/hl_pec.png --highlight pectoralis-major
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VIEWS = {
    # az: 相机绕 y 轴方位角(度)，0=正面(+z)；el: 仰角(度)
    "front": (0.0, 4.0),
    "back": (180.0, 4.0),
    "left": (-90.0, 4.0),
    "right": (90.0, 4.0),
    "threequarter": (34.0, 6.0),
    "threequarter-back": (146.0, 6.0),
}


def norm(v):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def build_camera(az_deg, el_deg, target, distance):
    az = math.radians(az_deg)
    el = math.radians(el_deg)
    direction = np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)])
    cam_pos = np.asarray(target, dtype=np.float64) + direction * distance
    forward = norm(np.asarray(target, dtype=np.float64) - cam_pos)
    world_up = np.array([0.0, 1.0, 0.0])
    right = norm(np.cross(forward, world_up))
    up = np.cross(right, forward)
    return cam_pos, forward, right, up


def load_triangles(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    tris = []
    colors = []
    muscle_ids = []
    for mesh in data["meshes"]:
        flat = np.asarray(mesh["tris"], dtype=np.float64)
        if flat.size == 0:
            continue
        t = flat.reshape(-1, 3, 3)
        tris.append(t)
        colors.append(np.tile(np.asarray(mesh["color"], dtype=np.float64) / 255.0, (t.shape[0], 1)))
        muscle_ids.extend([mesh.get("muscleId")] * t.shape[0])
    tris = np.concatenate(tris, axis=0) if tris else np.zeros((0, 3, 3))
    colors = np.concatenate(colors, axis=0) if colors else np.zeros((0, 3))
    return data, tris, colors, muscle_ids


def background(w, h, glow_center):
    """深色展厅背景：竖直渐变 + 身体后方的暖色舞台光晕 + 地板倒影氛围。"""
    top = np.array([12, 16, 23], dtype=np.float64)
    bottom = np.array([4, 5, 8], dtype=np.float64)
    ys = np.linspace(0, 1, h)[:, None, None]
    bg = top[None, None, :] * (1 - ys) + bottom[None, None, :] * ys
    bg = np.repeat(bg, w, axis=1)

    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = glow_center
    dist = np.sqrt(((xx - cx) / (w * 0.62)) ** 2 + ((yy - cy) / (h * 0.55)) ** 2)
    glow = np.clip(1.0 - dist, 0, 1) ** 2.2
    warm = np.array([64, 42, 34], dtype=np.float64)
    bg = bg + glow[:, :, None] * warm[None, None, :] * 0.55

    # 顶部暗角
    vig = np.sqrt(((xx - w * 0.5) / (w * 0.78)) ** 2 + ((yy - h * 0.52) / (h * 0.8)) ** 2)
    vig = np.clip(vig - 0.35, 0, 1)[:, :, None] ** 1.6
    bg = bg * (1.0 - 0.55 * vig)
    return np.clip(bg, 0, 255).astype(np.uint8)


def render(args):
    geo_path = args.input or os.path.join(ROOT, "shots", "geometry.json")
    data, tris, colors, muscle_ids = load_triangles(geo_path)
    if tris.shape[0] == 0:
        print("NO_TRIANGLES", file=sys.stderr)
        return 1

    w, h = (int(x) for x in args.size.lower().split("x"))
    ss = max(1, int(args.scale))
    W, H = w * ss, h * ss

    bmin = np.asarray(data["bounds"]["min"], dtype=np.float64)
    bmax = np.asarray(data["bounds"]["max"], dtype=np.float64)
    target = np.array([0.0, (bmin[1] + bmax[1]) * 0.52 - 0.04, 0.0])
    distance = args.distance if args.distance else 3.55
    az, el = VIEWS.get(args.view, VIEWS["front"])
    cam_pos, forward, right, up = build_camera(az, el, target, distance)

    rel = tris - cam_pos[None, None, :]
    x = np.einsum("ijk,k->ij", rel, right)
    y = np.einsum("ijk,k->ij", rel, up)
    z = np.einsum("ijk,k->ij", rel, forward)

    f = (H * 0.5) / math.tan(math.radians(args.fov) * 0.5)
    zz = np.maximum(z, 1e-6)
    px = W * 0.5 + (x / zz) * f
    py = H * 0.5 - (y / zz) * f

    inside = np.all(z > 0.12, axis=1)
    # 法线（世界坐标）与相机方向
    v0, v1, v2 = tris[:, 0], tris[:, 1], tris[:, 2]
    n = np.cross(v1 - v0, v2 - v0)
    ln = np.linalg.norm(n, axis=1)
    ok = (ln > 1e-12)
    n = np.where(ok[:, None], n / np.maximum(ln[:, None], 1e-12), np.array([0.0, 1.0, 0.0]))
    centroid = tris.mean(axis=1)
    view_dir = centroid - cam_pos[None, :]
    view_dir = view_dir / np.maximum(np.linalg.norm(view_dir, axis=1)[:, None], 1e-12)
    flip = np.einsum("ij,ij->i", n, view_dir) > 0
    n[flip] *= -1

    # 灯光
    L_key = norm([-0.55, 0.75, 0.95])
    L_fill = norm([0.85, 0.15, 0.35])
    L_rim = norm([0.25, 0.55, -0.85])
    diff_key = np.clip(n @ L_key, 0, 1)
    diff_fill = np.clip(n @ L_fill, 0, 1)
    rim = np.clip(1.0 - np.einsum("ij,ij->i", n, view_dir), 0, 1) ** 3
    rim2 = np.clip(n @ L_rim, 0, 1) * 0.35
    spec = np.clip(n @ norm(L_key + view_dir.mean(axis=0)), 0, 1) ** 26

    shade = 0.34 + 0.62 * diff_key + 0.20 * diff_fill + 0.30 * rim + rim2 + 0.10 * spec

    rgb = colors * shade[:, None]
    rgb = rgb + np.array([0.02, 0.012, 0.010])[None, :]
    rgb = 1.0 - np.exp(-rgb * 1.35)
    rgb = np.clip(rgb, 0, 1) ** (1.0 / 1.12)
    rgb255 = (rgb * 255.0).astype(np.uint8)

    if args.highlight:
        mask = np.array([mid == args.highlight for mid in muscle_ids])
        if mask.any():
            grey = rgb255.mean(axis=1, keepdims=True)
            dim = (grey * 0.55 + np.array([10, 8, 8])).astype(np.uint8)
            rgb255[~mask] = (rgb255[~mask] * 0.30).astype(np.uint8) + dim[~mask] // 3
        else:
            print("HIGHLIGHT_ID_NOT_FOUND:", args.highlight, file=sys.stderr)

    base = background(W, H, (W * 0.5, H * 0.46))
    img = Image.fromarray(base, "RGB")
    draw = ImageDraw.Draw(img)

    # 画家算法：远的先画（相机空间 z 为沿视线方向的正距离，越大越远）
    depth = z.mean(axis=1)
    order = np.argsort(depth)[::-1]
    pts = np.stack([px, py], axis=-1)
    for i in order:
        if not inside[i]:
            continue
        p = pts[i]
        draw.polygon([(p[0, 0], p[0, 1]), (p[1, 0], p[1, 1]), (p[2, 0], p[2, 1])],
                     fill=tuple(int(c) for c in rgb255[i]))

    if ss > 1:
        img = img.resize((w, h), Image.LANCZOS)
    # 轻微辉光：亮部扩散
    bloom = img.filter(ImageFilter.GaussianBlur(radius=max(1.0, w / 420.0)))
    img = Image.blend(img, Image.blend(img, bloom, 0.55), 0.35)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    img.save(args.out)
    print("RENDER_OK", args.view, "triangles=", int(inside.sum()), "->", args.out)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=os.path.join(ROOT, "shots", "geometry.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "shots", "preview_front.png"))
    ap.add_argument("--view", default="front", choices=sorted(VIEWS.keys()))
    ap.add_argument("--size", default="760x1040")
    ap.add_argument("--scale", default="2")
    ap.add_argument("--fov", type=float, default=29.0)
    ap.add_argument("--distance", type=float, default=3.55)
    ap.add_argument("--highlight", default=None)
    args = ap.parse_args()
    return render(args)


if __name__ == "__main__":
    sys.exit(main())
