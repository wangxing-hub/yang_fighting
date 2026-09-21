#!/usr/bin/env python3
"""把 AI 生成的素材处理成《杨凡大战潘尔赛》能直接用的透明图。

原始图片的三个问题：
  1. 没有 alpha 通道，背景是一整片接近纯白的噪点；
  2. 一行格子排开（行走图 6048x672，每格 672；投掷图 4992x832，每格 832）；
  3. **投掷图的相邻帧会互相「串味」**——某一帧甩出去的手臂/锅子画到了隔壁格子里，
     直接按格子切会在画面边缘多出一小块别人的残影。

处理流程（每张表）：
  四边泛洪去背景 -> 柔和边缘 -> 去掉小噪点
  -> 逐格去掉「没碰到本格中间带」的孤立碎块（止血，只对投掷图做）
  -> 取所有格子的公共包围盒（帧间不抖动）-> 缩小 2 倍
  -> 输出 assets/<名字>.png + assets/<名字>.json

行走图和投掷图的人物**画得不一样大**（格子 832 比 672 大，人物也跟着大 16%~29%），
所以每张表在 json 里额外记两个数：
  feet：姿势参考帧的「脚底中心」在本表帧内的坐标（游戏里用它当 origin）
  unit：姿势参考帧的人物高度（本表帧内的像素）
游戏里把 scale 设成 目标高度/unit，所有动画就会一样高、脚也踩在同一个点上。

除了人物精灵表，还会：
  * 把 2048x2048 的卡通半身像裁成圆形对话头像；
  * 处理场景背景（顺手抹掉右下角「豆包AI生成」的水印）；
  * 把网页实际加载的大小图压成 assets/small/*.webp。
"""

from __future__ import annotations

import argparse
import json
import shutil
import struct
import subprocess
import sys
import zlib
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
# 网页实际加载的小图都放这儿（assets/ 里的大图只作为"原图"留着）
SMALL = ASSETS / "small"

DOWNSCALE = 2          # 输出时缩小倍数
PAD = 4                # 公共包围盒外扩像素
NOISE = 220            # 小于这么多像素的孤立碎块当噪点扔掉
BAND = (0.28, 0.72)    # 人物「主体带」在格子里的横向比例，用来判断碎块要不要留
AVATAR_SIZE = 224      # 对话头像输出尺寸
SHEET_SMALL = 0.7      # 精灵表生成网页小图时再缩多少（人物约 170px 高，还有 1.5 倍余量）

# --------------------------------------------------------------------------- 素材清单
#
# 每张表：id（输出名）、src（pic/ 下的源图）、cell（原图每格宽度）、frames（格数）
#   bleed=True 的表会做「止血」（丢掉从隔壁格子漏进来的孤立碎块）
#   ref        用来量「脚底中心 / 人物高度」的帧号，取一个站姿的帧

CHARACTERS = [
    {
        "id": "yang",
        "name": "杨凡",
        "unit": 314.5,   # 这个角色在"处理过的大图"里有多高（照 杨凡移动精灵图 量的）
        "sheets": [
            {"id": "yang_walk", "src": "杨凡移动精灵图.png", "cell": 672, "frames": 9, "ref": 0},
            {"id": "yang_attack", "src": "杨攻击动作雪碧图.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
            {"id": "yang_strike", "src": "杨投掷攻击动作雪碧图.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
            {"id": "yang_noodle", "src": "杨投掷泡面动作雪碧图.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
        ],
    },
    {
        "id": "pan",
        "name": "潘尔赛",
        "unit": 311.0,
        "sheets": [
            {"id": "pan_walk", "src": "潘尔赛的人物精灵图.png", "cell": 672, "frames": 9, "ref": 0},
            {"id": "pan_strike", "src": "潘尔赛的空手投掷动作.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
            {"id": "pan_pan", "src": "潘投掷平底锅动作雪碧图.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
            {"id": "pan_crab", "src": "潘投掷螃蟹动作雪碧图.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
        ],
    },
    {
        "id": "huang",
        "name": "黄姐",
        "unit": 281.5,   # 黄姐的比例基准是旧的走路图（护士图是另一个绘制比例，不能当基准）
        "sheets": [
            {"id": "huang_walk", "src": "黄姐移动精灵图.png", "cell": 672, "frames": 9, "ref": 0},
            {"id": "huang_nurse", "src": "护士黄姐移动雪碧图.png", "cell": 832, "frames": 6, "ref": 0},
            {"id": "huang_durian", "src": "黄姐投掷榴莲动作精灵图.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
            {"id": "huang_needle", "src": "黄姐投掷针头.png", "cell": 832, "frames": 6, "ref": 0, "bleed": True},
        ],
    },
]

# 对话头像：源文件 -> 输出名
# diameterScale / centerShift 是个别素材的取景微调：杨凡那张全身像在画面里
# 框得比较远、脑袋偏小，按默认比例裁出来会显得人很小，所以收一点、往下挪一点。
PORTRAITS = [
    {"src": "潘尔赛卡通图.png", "name": "avatar_pan"},
    {"src": "黄姐卡通图片.png", "name": "avatar_huang"},
    {
        "src": "杨凡卡通图片.png",
        "name": "avatar_yang",
        "diameterScale": 0.86,
        "centerShift": [0, 50],
    },
]

# 场景背景图：源文件 -> 输出名
# 松鸭湖那张右下角带着"豆包AI生成"的水印，用上方同色地面盖掉，
# 再缩到游戏里实际显示的尺寸（1280 宽铺满画布）。
BACKGROUNDS = [
    {
        "src": "松鸭湖背景图.png",
        "name": "lake_bg",
        "outWidth": 1280,
        "watermarks": [{"x": 2002, "y": 1633, "w": 274, "h": 62}],
    },
]

# 小图任务：源图（assets/ 里的大图）-> assets/small/ 下的 webp
#   scale   ：还要不要再缩小（人物只显示 170px 高，缩到 0.8 倍仍然有 1.7 倍余量，
#             在手机上看起来才不糊）
#   quality ：数字 = 有损质量（配合 -alpha_q 100，alpha 通道无损），None = 完全无损
#
# 人物贴图用「有损 q86」：实测平均色差 1.9/255、最大单通道差 17，
# 而边缘的 alpha 一个像素都没变（不会出现脏边），体积只有无损的 23%。
SMALL_JOBS = [
    # 精灵表要按"每帧宽度"对齐着缩，不然整张图缩完跟 frameWidth 对不上，最后一帧会偏几像素
    {"src": "yang_walk.png", "scale": 0.7, "quality": 86, "frames": 9},
    {"src": "yang_attack.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "yang_noodle.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "pan_walk.png", "scale": 0.7, "quality": 86, "frames": 9},
    {"src": "pan_strike.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "pan_pan.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "pan_crab.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "huang_nurse.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "huang_durian.png", "scale": 0.7, "quality": 86, "frames": 6},
    {"src": "huang_needle.png", "scale": 0.7, "quality": 86, "frames": 6},
    # 杨的旧投掷动作、黄姐的旧便服走路、松鸭湖背景现在都用不到了：
    # 处理好的大图留在 assets/ 当素材档案，不再生成网页小图
    {"src": "avatar_pan.png", "scale": 0.72, "quality": None},
    {"src": "avatar_huang.png", "scale": 0.72, "quality": None},
    {"src": "avatar_yang.png", "scale": 0.72, "quality": None},
]


# --------------------------------------------------------------------------- PNG 读取

def read_png(path: Path) -> tuple[int, int, int, int, bytes]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} 不是 PNG 文件")
    pos, idat = 8, b""
    width = height = bitdepth = colortype = None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bitdepth, colortype, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if interlace:
                raise ValueError("不支持隔行扫描的 PNG")
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colortype]
    if bitdepth != 8:
        raise ValueError(f"只支持 8bit PNG，当前 {bitdepth}bit")

    raw = zlib.decompress(idat)
    stride = width * channels
    out = bytearray(width * height * channels)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        f = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        if f == 1:      # Sub
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 255
        elif f == 2:    # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:    # Average
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:    # Paeth
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return width, height, channels, colortype, bytes(out)


# --------------------------------------------------------------------------- PNG 写出

def write_png(path: Path, width: int, height: int, rgba: bytearray) -> None:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride : (y + 1) * stride]

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


# --------------------------------------------------------------------------- 抠图

def is_background(r: int, g: int, b: int) -> bool:
    """接近纯白且没有彩色的像素视为背景。"""
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    return lum >= 205 and sat <= 20


def cut_background(width: int, height: int, channels: int, px: bytes) -> bytearray:
    """去掉接近纯白的背景，返回每像素 alpha。"""
    # 1) 从四边泛洪，标记与画布边缘连通的背景像素
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * width + x
        if visited[i]:
            return
        p = i * channels
        if not is_background(px[p], px[p + 1], px[p + 2]):
            return
        visited[i] = 1
        queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            push(x - 1, y)
        if x < width - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < height - 1:
            push(x, y + 1)

    # 2) 生成 alpha：背景全透明，贴着背景的浅灰像素做半透明过渡，去掉白边
    alpha = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            i = row + x
            if visited[i]:
                continue
            p = i * channels
            r, g, b = px[p], px[p + 1], px[p + 2]
            sat = max(r, g, b) - min(r, g, b)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            touches_bg = False
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= height:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if 0 <= nx < width and visited[ny * width + nx]:
                        touches_bg = True
                        break
                if touches_bg:
                    break
            if touches_bg and sat <= 22:
                # 越接近纯白越透明，越接近人物本色越不透明
                a = (238.0 - lum) / 58.0
                alpha[i] = int(max(0.0, min(1.0, a)) * 255)
            else:
                alpha[i] = 255

    # 3) 去掉零星噪点（面积很小的前景连通块）
    component = [0] * (width * height)
    comp_id = 0
    comp_size: list[int] = [0]
    for y in range(height):
        for x in range(width):
            i = y * width + x
            if alpha[i] == 0 or component[i]:
                continue
            comp_id += 1
            size = 0
            stack = [(x, y)]
            component[i] = comp_id
            while stack:
                cx, cy = stack.pop()
                size += 1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        ni = ny * width + nx
                        if alpha[ni] and not component[ni]:
                            component[ni] = comp_id
                            stack.append((nx, ny))
            comp_size.append(size)

    removed = 0
    for i in range(width * height):
        if alpha[i] and comp_size[component[i]] < 200:
            alpha[i] = 0
            removed += 1
    print(f"清除噪点像素 {removed} 个（连通块 <200px）")
    return alpha


def label_cell(alpha: bytearray, cw: int, ch: int, x0: int, sheet_w: int):
    """把一格里的前景做 4 连通标记。返回 (labels, comps)。

    labels 是格内局部索引的数组；comps 是 [{size, x0, y0, x1, y1}]。
    """
    labels = [0] * (cw * ch)
    comps: list[dict] = []
    for y in range(ch):
        for x in range(cw):
            if not alpha[y * sheet_w + x0 + x]:
                continue
            i = y * cw + x
            if labels[i]:
                continue
            cid = len(comps) + 1
            size = 0
            bx0, by0, bx1, by1 = x, y, x, y
            stack = [(x, y)]
            labels[i] = cid
            while stack:
                cx, cy = stack.pop()
                size += 1
                if cx < bx0:
                    bx0 = cx
                if cx > bx1:
                    bx1 = cx
                if cy < by0:
                    by0 = cy
                if cy > by1:
                    by1 = cy
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < cw and 0 <= ny < ch:
                        ni = ny * cw + nx
                        if alpha[ny * sheet_w + x0 + nx] and not labels[ni]:
                            labels[ni] = cid
                            stack.append((nx, ny))
            comps.append({"size": size, "x0": bx0, "y0": by0, "x1": bx1, "y1": by1})
    return labels, comps


def clean_cell(
    alpha: bytearray,
    cw: int,
    ch: int,
    x0: int,
    sheet_w: int,
    keep_band: bool,
) -> tuple[int, int, list[dict]]:
    """去掉一格里的小噪点，必要时再丢掉「串味」的孤立碎块。

    「中间带」是这一格横向 28%~72% 的区域：人物主体一定穿过它，而从隔壁格子
    漏进来的手臂/锅子碎片一般贴在格子边缘，判定为串味丢掉。
    """
    labels, comps = label_cell(alpha, cw, ch, x0, sheet_w)
    band0 = cw * BAND[0]
    band1 = cw * BAND[1]
    dropped: list[dict] = []
    noise_px = 0
    for cid, c in enumerate(comps, start=1):
        if c["size"] < NOISE:
            noise_px += c["size"]
            reason = "noise"
        elif keep_band and (c["x1"] < band0 or c["x0"] > band1):
            reason = "bleed"
        else:
            continue
        dropped.append(
            {"size": c["size"], "box": (c["x0"], c["y0"], c["x1"], c["y1"]), "reason": reason}
        )
        for y in range(c["y0"], c["y1"] + 1):
            base = y * sheet_w + x0
            row = y * cw
            for x in range(c["x0"], c["x1"] + 1):
                if labels[row + x] == cid:
                    alpha[base + x] = 0
    return noise_px, len(comps), dropped


def cell_bbox(alpha: bytearray, sheet_w: int, x0: int, cw: int, ch: int):
    """一格内容在本格坐标系里的包围盒；空的话返回 None。"""
    mnx, mny, mxx, mxy = cw, ch, -1, -1
    for y in range(ch):
        row = y * sheet_w + x0
        for x in range(cw):
            if alpha[row + x]:
                if x < mnx:
                    mnx = x
                if x > mxx:
                    mxx = x
                if y < mny:
                    mny = y
                if y > mxy:
                    mxy = y
    if mxx < 0:
        return None
    return (mnx, mny, mxx, mxy)


def process_sheet(job: dict, char_id: str) -> dict:
    src = ROOT / "pic" / job["src"]
    if not src.exists():
        print(f"找不到源图：{src}", file=sys.stderr)
        return {}

    cell = job["cell"]
    frames = job["frames"]
    keep_band = bool(job.get("bleed"))
    width, height, channels, colortype, px = read_png(src)
    if width != cell * frames:
        print(f"!! {src.name} 宽度 {width} 不是 {cell}x{frames} 的整数倍", file=sys.stderr)
        frames = width // cell

    print(f"\n=== 精灵表 {src.name}  {width}x{height}  每格 {cell}  共 {frames} 帧 ===")
    alpha = cut_background(width, height, channels, px)

    # 逐格清理：小噪点 + （投掷表）串味碎块
    total_noise = 0
    for f in range(frames):
        noise_px, ncomp, dropped = clean_cell(alpha, cell, height, f * cell, width, keep_band)
        total_noise += noise_px
        bleeds = [d for d in dropped if d["reason"] == "bleed"]
        if bleeds:
            print(f"  第 {f} 帧丢掉串味碎块：" + "、".join(f"{d['size']}px{d['box']}" for d in bleeds))
    print(f"  清除噪点像素 {total_noise} 个（连通块 <{NOISE}px）")

    # 4) 所有帧共用一个「格内」包围盒，避免动画抖动
    boxes = [cell_bbox(alpha, width, f * cell, cell, height) for f in range(frames)]
    for f, b in enumerate(boxes):
        if b is None:
            print(f"警告：第 {f} 帧没有内容")
    min_x = min(b[0] for b in boxes if b)
    min_y = min(b[1] for b in boxes if b)
    max_x = max(b[2] for b in boxes if b)
    max_y = max(b[3] for b in boxes if b)
    crop_x = max(0, min_x - PAD)          # 格内局部坐标
    crop_y = max(0, min_y - PAD)
    crop_w = min(cell, max_x + 1 + PAD) - crop_x
    crop_h = min(height, max_y + 1 + PAD) - crop_y
    print(f"公共包围盒（格内）x={crop_x} y={crop_y} w={crop_w} h={crop_h}")
    for f, b in enumerate(boxes):
        if b:
            print(f"  第 {f} 帧 x {b[0]}-{b[2]} y {b[1]}-{b[3]}（人物高 {b[3] - b[1] + 1}）")

    # 5) 裁切 + 缩小（按 alpha 加权的 box filter，避免出现灰边）
    out_w = crop_w // DOWNSCALE
    out_h = crop_h // DOWNSCALE
    sheet_w = out_w * frames
    rgba = bytearray(sheet_w * out_h * 4)
    for f in range(frames):
        base_x = f * cell + crop_x
        for oy in range(out_h):
            for ox in range(out_w):
                sa = sr = sg = sb = 0.0
                for dy in range(DOWNSCALE):
                    y = crop_y + oy * DOWNSCALE + dy
                    row = y * width
                    for dx in range(DOWNSCALE):
                        x = base_x + ox * DOWNSCALE + dx
                        i = row + x
                        a = alpha[i] / 255.0
                        p = i * channels
                        sa += a
                        sr += px[p] * a
                        sg += px[p + 1] * a
                        sb += px[p + 2] * a
                n = DOWNSCALE * DOWNSCALE
                o = ((oy * sheet_w) + f * out_w + ox) * 4
                if sa > 0:
                    rgba[o] = int(sr / sa + 0.5)
                    rgba[o + 1] = int(sg / sa + 0.5)
                    rgba[o + 2] = int(sb / sa + 0.5)
                rgba[o + 3] = int(sa / n * 255 + 0.5)

    # 参考帧的「脚底中心」和人物高度：游戏里靠这两个数把所有动画对齐
    ref = boxes[job.get("ref", 0)] or boxes[0]
    feet = [
        round(((ref[0] + ref[2]) / 2 - crop_x) / DOWNSCALE, 1),
        round((ref[3] - crop_y) / DOWNSCALE, 1),
    ]
    unit = round((ref[3] - ref[1] + 1) / DOWNSCALE, 1)

    out_png = ASSETS / f"{job['id']}.png"
    out_json = ASSETS / f"{job['id']}.json"
    out_png.parent.mkdir(parents=True, exist_ok=True)
    write_png(out_png, sheet_w, out_h, rgba)

    meta = {
        "image": out_png.name,
        "sheet": job["id"],
        "character": char_id,
        "role": job["id"].split("_", 1)[1],
        "frameWidth": out_w,
        "frameHeight": out_h,
        "frames": frames,
        "source": src.name,
        "sourceCellSize": [cell, height],
        "cropBox": [crop_x, crop_y, crop_w, crop_h],
        "downscale": DOWNSCALE,
        "feet": feet,
        "unit": unit,
        "refFrame": job.get("ref", 0),
        "note": "feet 是脚底中心在帧内的坐标，unit 是参考帧人物高度；scale=目标高度/unit。",
    }
    out_json.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"输出 {out_png.relative_to(ROOT)}  {sheet_w}x{out_h}  单帧 {out_w}x{out_h}"
        f"  feet={feet} unit={unit}"
    )

    # 6) 打印 ASCII 预览，方便在无图形环境下检查抠图和止血的效果
    f = meta["refFrame"]
    print(f"\n第 {f} 帧预览（# 实心, + 半透明, . 透明）")
    rows, cols = 26, 34
    for ry in range(rows):
        line = ""
        for rx in range(cols):
            x = f * out_w + rx * out_w // cols
            y = ry * out_h // rows
            a = rgba[(y * sheet_w + x) * 4 + 3]
            line += "#" if a > 200 else ("+" if a > 60 else ".")
        print("  " + line)

    return {
        "id": job["id"],
        "character": char_id,
        "frameWidth": out_w,
        "frameHeight": out_h,
        "frames": frames,
        "feet": feet,
        "unit": unit,
    }


def process_portrait(job: dict) -> dict:
    """2048x2048 卡通半身像 -> 圆形对话头像（深色底 + 黄铜圈）。"""
    src = ROOT / "pic" / job["src"]
    if not src.exists():
        print(f"找不到源图：{src}", file=sys.stderr)
        return {}

    width, height, channels, colortype, px = read_png(src)
    print(f"\n=== 头像 {src.name}  {width}x{height} ===")
    alpha = cut_background(width, height, channels, px)

    def strong_foreground(x: int, y: int) -> bool:
        """头像里真正属于角色的像素（排除浅灰背景/渐变）"""
        i = y * width + x
        if alpha[i] < 200:
            return False
        p = i * channels
        r, g, b = px[p], px[p + 1], px[p + 2]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        sat = max(r, g, b) - min(r, g, b)
        return lum < 185 or sat > 45

    # 头肩区域（只看上方 62%，避免把地面/背景装饰算进来）
    min_x, min_y, max_x, max_y = width, height, -1, -1
    for y in range(0, int(height * 0.62)):
        for x in range(width):
            if strong_foreground(x, y):
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    box_w = max_x - min_x + 1
    box_h = max_y - min_y + 1
    print(f"头肩区域 x {min_x}-{max_x} (宽 {box_w}) y {min_y}-{max_y} (高 {box_h})")

    # 头肩比例：这种半身像里脑袋大约占头肩高度的 55%，取景按比例来最稳
    head_h = box_h * 0.55
    diameter = head_h * 1.35 * job.get("diameterScale", 1.0)
    shift_x, shift_y = job.get("centerShift", (0, 0))
    crop_cx = (min_x + max_x) / 2 + shift_x
    crop_cy = min_y + head_h * 0.5 + shift_y
    print(f"圆形取景 中心 ({crop_cx:.0f}, {crop_cy:.0f}) 直径 {diameter:.0f}")

    size = AVATAR_SIZE
    half = size / 2 - 0.5
    ring_w = 4.0
    r_disc = half - ring_w
    r_face = r_disc - 2
    rgba = bytearray(size * size * 4)
    ss = 3  # 3x3 超采样，边缘更干净

    for oy in range(size):
        for ox in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    fx = ox + (sx + 0.5) / ss - 0.5
                    fy = oy + (sy + 0.5) / ss - 0.5
                    dx = fx - half
                    dy = fy - half
                    dist = (dx * dx + dy * dy) ** 0.5
                    if dist > half:
                        continue
                    # 外圈黄铜
                    if dist > r_disc:
                        t = (dist - r_disc) / ring_w
                        r, g, b = int(201 + 30 * t), int(164 + 40 * t), int(76 + 40 * t)
                        acc[0] += r
                        acc[1] += g
                        acc[2] += b
                        acc[3] += 255
                        continue
                    # 底盘
                    r, g, b = 36, 26, 18
                    if dist <= r_face:
                        # 映射回原图取角色像素
                        src_x = int(crop_cx + dx / r_face * (diameter / 2))
                        src_y = int(crop_cy + dy / r_face * (diameter / 2))
                        if 0 <= src_x < width and 0 <= src_y < height:
                            i = src_y * width + src_x
                            a = alpha[i] / 255.0
                            p = i * channels
                            r = int(r * (1 - a) + px[p] * a)
                            g = int(g * (1 - a) + px[p + 1] * a)
                            b = int(b * (1 - a) + px[p + 2] * a)
                    acc[0] += r
                    acc[1] += g
                    acc[2] += b
                    acc[3] += 255
            n = ss * ss
            o = (oy * size + ox) * 4
            if acc[3] > 0:
                samples = acc[3] / 255
                rgba[o] = int(acc[0] / samples + 0.5)
                rgba[o + 1] = int(acc[1] / samples + 0.5)
                rgba[o + 2] = int(acc[2] / samples + 0.5)
                rgba[o + 3] = int(min(255, acc[3] / n) + 0.5)

    out_png = ASSETS / f"{job['name']}.png"
    write_png(out_png, size, size, rgba)
    print(f"输出 {out_png.relative_to(ROOT)}  {size}x{size}")

    rows, cols = 34, 34
    print("头像预览（# 角色, . 底色, 空格 透明）")
    for ry in range(rows):
        line = ""
        for rx in range(cols):
            x = rx * size // cols
            y = ry * size // rows
            o = (y * size + x) * 4
            if rgba[o + 3] < 40:
                line += " "
            else:
                lum = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]
                line += "#" if lum > 130 else "."
        print("  " + line)
    return {"image": out_png.name, "size": size}


def erase_watermark(
    px: bytearray,
    width: int,
    height: int,
    channels: int,
    rect: dict,
    pad: int = 14,
    feather: int = 10,
) -> tuple[int, int, int, int]:
    """用水印正上方同样花色的地面把水印盖掉，四周做羽化过渡。

    水印没法"擦掉"（它已经和画面混在一起了），但这类 AI 背景的地面是低频的
    一片近似纯色，从上面搬一块同样宽高的地面过来、边缝羽化一下，就看不出来了。
    """
    x0 = max(0, rect["x"] - pad)
    y0 = max(0, rect["y"] - pad)
    x1 = min(width, rect["x"] + rect["w"] + pad)
    y1 = min(height, rect["y"] + rect["h"] + pad)
    donor_dy = (y1 - y0) + 12
    original = bytes(px)

    for y in range(y0, y1):
        sy = y - donor_dy
        if sy < 0:
            sy = y + donor_dy  # 上面不够就从下面搬
        if not (0 <= sy < height):
            continue
        for x in range(x0, x1):
            edge = min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y)
            t = min(1.0, edge / feather)
            k = t * t * (3 - 2 * t)  # smoothstep：贴边全用原图，里面全用搬运来的地面
            o = (y * width + x) * channels
            s = (sy * width + x) * channels
            for c in range(min(3, channels)):
                px[o + c] = int(original[o + c] * (1 - k) + original[s + c] * k + 0.5)
    return x0, y0, x1, y1


def to_rgba(px: bytes, width: int, height: int, channels: int) -> bytearray:
    if channels == 4:
        return bytearray(px)
    out = bytearray(width * height * 4)
    for i in range(width * height):
        s = i * channels
        o = i * 4
        out[o] = px[s]
        out[o + 1] = px[s + 1]
        out[o + 2] = px[s + 2]
        out[o + 3] = 255
    return out


def resize_rgba(
    rgba: bytearray, width: int, height: int, out_width: int, out_height: int
) -> bytearray:
    """面积平均缩放：每个输出像素取对应的原图小方块求平均。"""
    out = bytearray(out_width * out_height * 4)
    for oy in range(out_height):
        sy0 = oy * height // out_height
        sy1 = max(sy0 + 1, (oy + 1) * height // out_height)
        for ox in range(out_width):
            sx0 = ox * width // out_width
            sx1 = max(sx0 + 1, (ox + 1) * width // out_width)
            acc = [0, 0, 0, 0]
            n = 0
            for y in range(sy0, sy1):
                row = y * width
                for x in range(sx0, sx1):
                    i = (row + x) * 4
                    acc[0] += rgba[i]
                    acc[1] += rgba[i + 1]
                    acc[2] += rgba[i + 2]
                    acc[3] += rgba[i + 3]
                    n += 1
            o = (oy * out_width + ox) * 4
            for c in range(4):
                out[o + c] = int(acc[c] / n + 0.5)
    return out


def process_background(job: dict) -> dict:
    src = ROOT / "pic" / job["src"]
    if not src.exists():
        print(f"找不到源图：{src}", file=sys.stderr)
        return {}

    width, height, channels, colortype, px = read_png(src)
    print(f"\n=== 背景 {src.name}  {width}x{height}  通道={channels} ===")

    work = bytearray(px)
    for rect in job.get("watermarks", []):
        box = erase_watermark(work, width, height, channels, rect)
        print(
            f"抹掉水印 x{rect['x']}-{rect['x'] + rect['w']} "
            f"y{rect['y']}-{rect['y'] + rect['h']}（羽化到 {box}）"
        )

    rgba = to_rgba(bytes(work), width, height, channels)
    out_w = job.get("outWidth", width)
    out_h = max(1, round(height * out_w / width))
    if (out_w, out_h) != (width, height):
        rgba = resize_rgba(rgba, width, height, out_w, out_h)

    out_png = ASSETS / f"{job['name']}.png"
    out_png.parent.mkdir(parents=True, exist_ok=True)
    write_png(out_png, out_w, out_h, rgba)
    print(f"输出 {out_png.relative_to(ROOT)}  {out_w}x{out_h}")

    # 抹掉的地方和周围对比一下，肉眼看不见就行
    for rect in job.get("watermarks", []):
        cx = rect["x"] + rect["w"] // 2
        cy = rect["y"] + rect["h"] // 2
        def avg(rx: int, ry: int, size: int = 40) -> list[int]:
            sx = min(max(0, rx), width - size)
            sy = min(max(0, ry), height - size)
            acc = [0, 0, 0]
            for y in range(sy, sy + size):
                for x in range(sx, sx + size):
                    i = (y * width + x) * channels
                    for c in range(3):
                        acc[c] += work[i + c]
            return [a // (size * size) for a in acc]

        inside = avg(cx - 20, cy - 20)
        around = avg(cx - 20, max(0, rect["y"] - 130 - 20))
        print(f"  水印处现在 RGB {inside}，旁边地面 RGB {around}")
    return {"image": out_png.name, "width": out_w, "height": out_h}


# 小图任务：源图（assets/ 里的大图）-> assets/small/ 下的 webp
#   scale    ：还要不要再缩小（人物只显示 133px 高，精灵表缩到 0.55 倍仍然够清晰）
#   quality  ：None = 无损（人物 / 头像这种带透明边缘的不能有压缩脏边），
#              数字 = 有损质量（背景照片类）
def process_small_assets() -> None:
    """把大图缩/压成 assets/small/*.webp —— 网页只加载这些。

    背景是照片类的，用有损 webp（1.9MB -> 一两百 KB）；
    人物 / 头像是带透明边缘的，用无损 webp（只缩小尺寸，不产生压缩脏边）。
    """
    if not shutil.which("cwebp"):
        print("\n!! 没找到 cwebp，跳过小图生成（brew install webp 可以装上）", file=sys.stderr)
        return

    SMALL.mkdir(parents=True, exist_ok=True)
    print("\n=== 生成网页用的小图（assets/small/）===")
    total_before = total_after = 0
    for job in SMALL_JOBS:
        src = ASSETS / job["src"]
        if not src.exists():
            print(f"  跳过（找不到 {src.name}）")
            continue
        width, height, channels, _, px = read_png(src)
        rgba = to_rgba(bytes(px), width, height, channels)
        out_h = max(1, round(height * job["scale"]))
        frames = job.get("frames")
        if frames:
            # 每帧宽度取整之后再乘回去，保证 out_w == frameWidth * frames
            out_w = max(1, round(width / frames * job["scale"])) * frames
        else:
            out_w = max(1, round(width * job["scale"]))
        if (out_w, out_h) != (width, height):
            rgba = resize_rgba(rgba, width, height, out_w, out_h)

        tmp = SMALL / (src.stem + ".tmp.png")
        write_png(tmp, out_w, out_h, rgba)
        out = SMALL / (src.stem + ".webp")
        cmd = ["cwebp", "-quiet", "-mt"]
        if job["quality"] is None:
            cmd += ["-lossless", "-z", "9"]
        else:
            # -alpha_q 100：alpha 通道保持无损，人物边缘不会脏
            cmd += ["-q", str(job["quality"]), "-m", "6", "-alpha_q", "100"]
        cmd += [str(tmp), "-o", str(out)]
        subprocess.run(cmd, check=True)
        tmp.unlink()

        before = src.stat().st_size
        after = out.stat().st_size
        total_before += before
        total_after += after
        print(
            f"  {src.name:18s} {width}x{height} {before // 1024:5d}KB"
            f"  ->  small/{out.name:18s} {out_w}x{out_h} {after // 1024:5d}KB"
        )
    if total_before:
        print(
            f"  合计：{total_before // 1024}KB -> {total_after // 1024}KB"
            f"（压到 {total_after / total_before * 100:.0f}%）"
        )


def print_config_snippet(coef: float) -> None:
    """把量好的参数换算成「网页小图 + 游戏 scale」，打成能直接粘进 config.js 的代码。

    小图是 assets/<名字>.png 再缩 SMALL_JOBS 里那个倍数得到的，
    所以帧尺寸、脚底坐标、人物高度都要跟着乘一次；origin 用比例所以不受影响。
    """
    scales = {Path(j["src"]).stem: j["scale"] for j in SMALL_JOBS}
    units = {c["id"]: c["unit"] for c in CHARACTERS}
    rows = []
    for path in sorted(ASSETS.glob("*.json")):
        meta = json.loads(path.read_text(encoding="utf-8"))
        if "feet" not in meta:
            continue
        s = scales.get(meta["sheet"])
        if s is None:
            continue
        rows.append(meta | {"small": s})
    if not rows:
        print("\n（还没有 sheets 的 json，跳过 config 片段）")
        return

    print("\n\n" + "=" * 72)
    print(f"量好的精灵表参数（小图倍数 + 屏幕高度系数 {coef}，直接粘进 src/config.js）")
    print("=" * 72)
    by_char: dict[str, list[dict]] = {}
    for m in rows:
        by_char.setdefault(m["character"], []).append(m)
    for char_id in ("yang", "pan", "huang"):
        if char_id not in by_char:
            continue
        sheets = by_char[char_id]
        height = round(units.get(char_id, sheets[0]["unit"]) * SHEET_SMALL * coef, 1)
        print(f"\n// {char_id}：屏幕上高 {height}px")
        for m in sheets:
            s = m["small"]
            fw = round(m["frameWidth"] * s)
            fh = round(m["frameHeight"] * s)
            unit = m["unit"] * s
            feet = [m["feet"][0] * s, m["feet"][1] * s]
            scale = height / unit
            print(
                f"  {m['sheet']}: {{ w: {fw}, h: {fh}, frames: {m['frames']}, "
                f"scale: {scale:.4f}, "
                f"origin: [{feet[0] / fw:.4f}, {feet[1] / fh:.4f}] }},"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="生成游戏素材")
    parser.add_argument(
        "only",
        nargs="?",
        default="all",
        choices=["all", "sheets", "portraits", "backgrounds", "small"],
        help="只跑其中一段（默认全跑）",
    )
    parser.add_argument(
        "--coef",
        type=float,
        default=0.56,
        help="屏幕上的人物高度 = 行走表的人物高度 x 这个系数（默认 0.56）",
    )
    args = parser.parse_args()

    if args.only in ("all", "sheets"):
        for char in CHARACTERS:
            print(f"\n########## {char['name']}（{char['id']}）##########")
            for job in char["sheets"]:
                process_sheet(job, char["id"])
    if args.only in ("all", "portraits"):
        for job in PORTRAITS:
            process_portrait(job)
    if args.only in ("all", "backgrounds"):
        for job in BACKGROUNDS:
            process_background(job)
    if args.only in ("all", "small"):
        process_small_assets()
    print_config_snippet(args.coef)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
