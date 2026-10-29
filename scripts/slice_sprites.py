"""Нарезает спрайт-листы white.png / black.png на отдельные фигуры с прозрачным фоном.
Запуск: python3 scripts/slice_sprites.py  (нужен Pillow)
Лист: 8 колонок x 2 ряда. Верхний ряд: ладья, конь, слон, ферзь, король, слон, конь, ладья.
Нижний ряд: 8 пешек. Фон листов чёрный; в каждой ячейке оставляется главная связная область."""
from PIL import Image
from collections import deque
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'pieces')
ORDER = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']
os.makedirs(OUT, exist_ok=True)

def is_bg(p):
    # Файлы white.png и black.png имеют чёрный фон; оставляем мягкие края
    # рисунка, исключая только почти чёрные пиксели.
    return max(p[0], p[1], p[2]) < 24

def largest_component(cell):
    w, h = cell.size
    px = cell.load()
    mask = [[not is_bg(px[x, y]) for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]
    best = []
    for y0 in range(h):
        for x0 in range(w):
            if mask[y0][x0] and not seen[y0][x0]:
                comp = []
                q = deque([(x0, y0)]); seen[y0][x0] = True
                while q:
                    x, y = q.popleft(); comp.append((x, y))
                    for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True; q.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    keep = set(best)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    opx = out.load()
    for x, y in keep:
        opx[x, y] = (*px[x, y][:3], 255)
    return out

pieces = {}
for src, color in (('white.png', 'w'), ('black.png', 'b')):
    im = Image.open(os.path.join(ROOT, src)).convert('RGB')
    W, H = im.size
    cw, ch = W / 8, H / 2
    for row in range(2):
        for col in range(8):
            name = 'pawn' if row == 1 else ORDER[col]
            box = (int(col * cw), int(row * ch), int((col + 1) * cw), int((row + 1) * ch))
            pieces[(color, name)] = largest_component(im.crop(box))

# общий холст: одинаковый масштаб и выравнивание по низу/центру
bboxes = {k: v.getbbox() for k, v in pieces.items()}
side_w = max(b[2] - b[0] for b in bboxes.values())
side_h = max(b[3] - b[1] for b in bboxes.values())
for (color, name), img in pieces.items():
    c = img.crop(bboxes[(color, name)])
    canvas_h = side_h + 8
    # Сохраняем соотношение сторон, ожидаемое интерфейсом (100:157).
    canvas_w = max(side_w + 8, round(canvas_h * 100 / 157))
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    canvas.paste(c, ((canvas_w - c.width) // 2, canvas_h - c.height - 4), c)
    canvas = canvas.resize((int(canvas.width * 0.5), int(canvas.height * 0.5)), Image.LANCZOS)
    canvas.save(os.path.join(OUT, f'{color}-{name}.png'))
print('ok', side_w, side_h)
