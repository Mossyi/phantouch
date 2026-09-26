#!/usr/bin/env python3
"""幻触 (Phantouch) 静态图片 WebP 优化器。

把指定目录下的 PNG / JPG 重新编码为 WebP，在肉眼几乎无差别的前提下大幅缩小体积。
转换后只有当 WebP 确实更小才会替换原图，否则保留原格式。

依赖：
    pip install Pillow

用法：
    python scripts/optimize-images.py --dir public/wardrobe
    python scripts/optimize-images.py --dir public/wardrobe --quality 85 --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Windows 控制台默认是 GBK，强制 UTF-8 输出，避免中文与符号触发编码错误
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("缺少 Pillow，请先执行：pip install Pillow", file=sys.stderr)
    raise SystemExit(1)

SUPPORTED = {".png", ".jpg", ".jpeg"}


def human(num_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num_bytes) < 1024 or unit == "GB":
            return f"{num_bytes:,.1f} {unit}" if unit != "B" else f"{num_bytes:,.0f} B"
        num_bytes /= 1024
    return f"{num_bytes:,.1f} GB"


def convert(path: Path, quality: int, dry_run: bool) -> tuple[int, int, bool]:
    """返回 (原始字节, WebP 字节, 是否已替换)。"""
    original_bytes = path.stat().st_size
    target = path.with_suffix(".webp")

    with Image.open(path) as image:
        # WebP 支持透明通道；有 alpha 时保留，否则用 RGB 编码以获得更小体积
        has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
        prepared = image.convert("RGBA" if has_alpha else "RGB")

        if dry_run:
            return original_bytes, 0, False

        prepared.save(
            target,
            format="WEBP",
            quality=quality,
            method=6,
        )

    webp_bytes = target.stat().st_size
    if webp_bytes >= original_bytes:
        target.unlink(missing_ok=True)
        return original_bytes, original_bytes, False

    path.unlink()
    return original_bytes, webp_bytes, True


def main() -> int:
    parser = argparse.ArgumentParser(description="把 PNG/JPG 转换为 WebP")
    parser.add_argument("--dir", required=True, help="要处理的目录")
    parser.add_argument("--quality", type=int, default=82, help="WebP 质量 (默认 82)")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不写文件")
    args = parser.parse_args()

    root = Path(args.dir)
    if not root.is_dir():
        print(f"目录不存在：{root}", file=sys.stderr)
        return 1

    candidates = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED)
    if not candidates:
        print("没有找到可转换的图片")
        return 0

    total_before = 0
    total_after = 0
    converted = 0
    skipped = 0

    print(f"处理目录：{root}")
    print(f"找到 {len(candidates)} 张图片，质量 {args.quality}{'（dry-run）' if args.dry_run else ''}\n")

    for path in candidates:
        before, after, replaced = convert(path, args.quality, args.dry_run)
        total_before += before
        total_after += after
        if replaced:
            converted += 1
            ratio = (1 - after / before) * 100 if before else 0
            print(f"  [OK] {path.name:46s} {human(before):>10s} -> {human(after):>10s}  (-{ratio:.0f}%)")
        else:
            skipped += 1
            if not args.dry_run:
                print(f"  [--] {path.name:46s} 已是更优格式，跳过")

    print("\n" + "=" * 60)
    if args.dry_run:
        print(f"共 {len(candidates)} 张，原始体积 {human(total_before)}")
    else:
        print(f"转换 {converted} 张，跳过 {skipped} 张")
        print(f"体积：{human(total_before)} -> {human(total_after)}"
              f"（节省 {(1 - total_after / total_before) * 100:.1f}%）")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())