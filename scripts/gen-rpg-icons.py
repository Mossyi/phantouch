import re, sys, json, os
root = sys.argv[1]
out = sys.argv[2]
icons = {
  # 地点
  'bed': 'delapouite/bed', 'sofa': 'delapouite/sofa', 'bathtub': 'delapouite/bathtub', 'locked-door': 'delapouite/locked-door',
  'present': 'delapouite/present', 'broom': 'delapouite/broom', 'coffee-cup': 'delapouite/coffee-cup', 'pine-tree': 'lorc/pine-tree',
  'sparkles': 'delapouite/sparkles', 'castle': 'delapouite/castle',
  # 课程
  'scroll-unfurled': 'lorc/scroll-unfurled', 'body-balance': 'delapouite/body-balance', 'teapot': 'lorc/teapot', 'kneeling': 'delapouite/kneeling',
  'whistle': 'delapouite/whistle', 'blindfold': 'delapouite/blindfold', 'footsteps': 'skoll/footsteps', 'hourglass': 'lorc/hourglass',
  'shaking-hands': 'delapouite/shaking-hands', 'notebook': 'delapouite/notebook', 'hearts': 'skoll/hearts',
  # 物品
  'cupcake': 'delapouite/cupcake', 'night-sleep': 'delapouite/night-sleep', 'heart-wings': 'delapouite/heart-wings', 'ticket': 'delapouite/ticket',
  'love-letter': 'delapouite/love-letter', 'fountain-pen': 'lorc/fountain-pen', 'ribbon': 'lorc/ribbon', 'heavy-collar': 'delapouite/heavy-collar',
  'candle-light': 'lorc/candle-light', 'cake-slice': 'lorc/cake-slice', 'ringing-bell': 'lorc/ringing-bell', 'open-book': 'lorc/open-book',
  # 特质 / 阶段 / 时段 / 其它
  'shield': 'lorc/checked-shield', 'feather': 'lorc/feather', 'lock-picking': 'delapouite/lock-picking', 'laurels': 'lorc/laurels', 'medal': 'lorc/medal',
  'trophy': 'lorc/trophy', 'sunrise': 'delapouite/sunrise', 'sun': 'delapouite/sun-cloud', 'sunset': 'delapouite/sunset', 'night-sky': 'lorc/night-sky',
  'calendar': 'delapouite/calendar', 'crown': 'lorc/crown', 'meditation': 'lorc/meditation',
}
paths = {}
authors = set()
for key, rel in icons.items():
    svg = open(os.path.join(root, rel + '.svg')).read()
    ds = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    ds = [d for d in ds if d.strip() != 'M0 0h512v512H0z']
    assert ds, rel
    paths[key] = ' '.join(ds)
    authors.add(rel.split('/')[0])
lines = [
  '/**',
  ' * 训练日程用的 RPG 图标，取自 game-icons.net（https://github.com/game-icons/icons）。',
  ' * 许可：CC BY 3.0，作者：' + '、'.join(sorted(authors)) + '。',
  ' * 只保留了图形路径（去掉黑色底框），viewBox 为 0 0 512 512，用 currentColor 着色。',
  ' * 由 scripts/gen-rpg-icons.py 从 game-icons 仓库生成：python3 scripts/gen-rpg-icons.py <icons 仓库目录> src/core/tavern/rpgIcons.ts',
  ' */',
  '',
  'export const RPG_ICON_CREDIT = ' + json.dumps('图标来自 game-icons.net（CC BY 3.0），作者 ' + '、'.join(sorted(a.capitalize() for a in authors)), ensure_ascii=False) + ';',
  '',
  'export const RPG_ICON_PATHS = {',
]
for key, d in paths.items():
    lines.append(f"  {json.dumps(key)}: {json.dumps(d)},")
lines.append('} as const;')
lines.append('')
lines.append('export type RpgIconName = keyof typeof RPG_ICON_PATHS;')
lines.append('')
open(out, 'w').write('\n'.join(lines))
print(len(paths), 'icons', os.path.getsize(out), 'bytes', sorted(authors))
