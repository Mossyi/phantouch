import os
import base64
from PIL import Image, ImageDraw

def create_round_icon(img, size):
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    result = resized.copy()
    result.putalpha(mask)
    return result

def create_squircle_icon(img, size, radius=None):
    if radius is None:
        radius = int(size * 0.2237)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)
    result = resized.copy()
    result.putalpha(mask)
    return result

def create_adaptive_foreground(img, canvas_size):
    # Scale content to ~85% so the character is completely within the 66-72dp safe circular mask,
    # and fill the entire 108dp canvas with the exact matching solid pink #FEC4D9 (254, 196, 217).
    content_size = int(canvas_size * 0.85)
    resized = img.resize((content_size, content_size), Image.Resampling.LANCZOS)
    
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (254, 196, 217, 255))
    offset = (canvas_size - content_size) // 2
    canvas.paste(resized, (offset, offset))
    return canvas

def main():
    master_path = os.path.join(os.path.dirname(__file__), '..', 'app_icon_clean.png')
    if not os.path.exists(master_path):
        print(f"Master icon not found at {master_path}")
        return

    master = Image.open(master_path).convert('RGBA')
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

    print("--- 1. Generating Web Assets in public/ ---")
    public_dir = os.path.join(base_dir, 'public')
    os.makedirs(public_dir, exist_ok=True)

    # Favicon PNG & ICO
    fav_128 = master.resize((128, 128), Image.Resampling.LANCZOS)
    fav_128.save(os.path.join(public_dir, 'favicon.png'), 'PNG')
    master.save(os.path.join(public_dir, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    # PWA icons
    pwa_192 = master.resize((192, 192), Image.Resampling.LANCZOS)
    pwa_192.save(os.path.join(public_dir, 'icon-192.png'), 'PNG')

    pwa_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    pwa_512.save(os.path.join(public_dir, 'icon-512.png'), 'PNG')

    # SVG wrappers
    png_512_path = os.path.join(public_dir, 'icon-512.png')
    with open(png_512_path, 'rb') as f:
        b64_data = base64.b64encode(f.read()).decode('utf-8')

    svg_template = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" width="{s}" height="{s}">
  <defs>
    <clipPath id="squircle">
      <rect width="{s}" height="{s}" rx="{r}" />
    </clipPath>
  </defs>
  <image width="{s}" height="{s}" clip-path="url(#squircle)" href="data:image/png;base64,{b64}" />
</svg>"""

    with open(os.path.join(public_dir, 'icon-192.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_template.format(s=192, r=42, b64=b64_data))

    with open(os.path.join(public_dir, 'icon-512.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_template.format(s=512, r=112, b64=b64_data))

    print("Web assets created successfully.")

    print("--- 2. Generating Android Launcher Icons in android/app/src/main/res/ ---")
    res_dir = os.path.join(base_dir, 'android', 'app', 'src', 'main', 'res')
    if os.path.exists(res_dir):
        densities = {
            'mipmap-mdpi': (48, 108),
            'mipmap-hdpi': (72, 162),
            'mipmap-xhdpi': (96, 216),
            'mipmap-xxhdpi': (144, 324),
            'mipmap-xxxhdpi': (192, 432),
        }

        for folder, (std_size, fg_size) in densities.items():
            target_folder = os.path.join(res_dir, folder)
            os.makedirs(target_folder, exist_ok=True)

            # ic_launcher.png (squircle)
            launcher_img = create_squircle_icon(master, std_size)
            launcher_img.save(os.path.join(target_folder, 'ic_launcher.png'), 'PNG')

            # ic_launcher_round.png (circle)
            round_img = create_round_icon(master, std_size)
            round_img.save(os.path.join(target_folder, 'ic_launcher_round.png'), 'PNG')

            # ic_launcher_foreground.png (adaptive foreground)
            fg_img = create_adaptive_foreground(master, fg_size)
            fg_img.save(os.path.join(target_folder, 'ic_launcher_foreground.png'), 'PNG')

            print(f"Updated {folder}: launcher({std_size}x{std_size}), round({std_size}x{std_size}), fg({fg_size}x{fg_size})")

    print("--- 3. Generating iOS App Icon if directory exists ---")
    ios_icon_dir = os.path.join(base_dir, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
    if os.path.exists(ios_icon_dir):
        ios_1024 = master.resize((1024, 1024), Image.Resampling.LANCZOS)
        ios_1024.convert('RGB').save(os.path.join(ios_icon_dir, 'AppIcon-512@2x.png'), 'PNG')
        print("Updated iOS AppIcon-512@2x.png")

    print("All app icons updated successfully!")

if __name__ == '__main__':
    main()
