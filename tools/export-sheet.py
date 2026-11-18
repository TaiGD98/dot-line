"""Exports design/level-system.xlsx from design/level-report.json (written by npm run levels:build).

Sheets:
  Difficulty criteria  - the criteria, ranges and weights (editable inputs, blue)
  Level system         - the 100 levels: plan, measured criteria, score by formula, rule checks, chart
  Images               - what each level's drawing shows and how it fits the slot

Run: python3 tools/export-sheet.py
"""
import json
import os
from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
report = json.load(open(os.path.join(ROOT, 'design', 'level-report.json')))
rows = [r for r in report['levels'] if r]

FONT = 'Arial'
BLUE = Font(name=FONT, color='0000FF')
BOLD = Font(name=FONT, bold=True)
NORMAL = Font(name=FONT)
HEAD_FILL = PatternFill('solid', fgColor='2E2A27')
HEAD_FONT = Font(name=FONT, bold=True, color='FFFFFF')
INPUT_FILL = PatternFill('solid', fgColor='FFF2CC')
ROLE_FILL = {'relax': 'E2F0D9', 'hard': 'FCE4D6', 'normal': 'FFFFFF', 'tutorial': 'DDEBF7'}
thin = Side(style='thin', color='D9D9D9')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical='top')

wb = Workbook()

# ---------------------------------------------------------------- Difficulty criteria
c = wb.active
c.title = 'Difficulty criteria'
c['A1'] = 'Dot Line: difficulty criteria and score'
c['A1'].font = Font(name=FONT, bold=True, size=14)
c['A2'] = ('Score (0-100) = 100 x sum of weight x normalised value. Normalised = (value - min) / (max - min), '
           'clamped to 0..1. Blue cells are inputs: change them and every score in "Level system" recalculates. '
           'The game and the level editor use the same formula (src/core/difficulty.ts); keep them in sync.')
c['A2'].alignment = WRAP
c.merge_cells('A2:H2')
c.row_dimensions[2].height = 48
hdr = ['Criterion', 'What it measures', 'How it is measured', 'Min', 'Max', 'Weight', 'Why it makes a level harder']
for i, h in enumerate(hdr, 1):
    cell = c.cell(row=4, column=i, value=h)
    cell.font = HEAD_FONT
    cell.fill = HEAD_FILL
criteria = [
    ('Lines', 'Number of lines (pairs) on the board: base + X + T', 'Count of pairs in the level file', 3, 100, 0.30,
     'More dots and lines to read, more to plan, longer level.'),
    ('Blocking depth', 'Longest chain of blocks', 'Rounds needed when every open pair is cleared each round (solver)', 1, 12, 0.30,
     'Deep chains mean the player must find the right order several steps ahead.'),
    ('Blocked share', 'Lines that bump something if tapped first', 'Blocked dot sides at the start / (2 x lines)', 0, 0.6, 0.30,
     'A random tap is likely to cost a heart: the level is easy to lose. Full marks at 60%.'),
    ('Colours', 'Distinct colours in the level', 'Count of colours used by pairs', 2, 12, 0.10,
     'More colours make it harder to see which two dots belong together.'),
]
for r, (name, what, how, lo, hi, w, why) in enumerate(criteria, 5):
    vals = [name, what, how, lo, hi, w, why]
    for col, v in enumerate(vals, 1):
        cell = c.cell(row=r, column=col, value=v)
        cell.font = BLUE if col in (4, 5, 6) else NORMAL
        cell.border = BORDER
        cell.alignment = WRAP
        if col in (4, 5, 6):
            cell.fill = INPUT_FILL
    c.cell(row=r, column=6).number_format = '0%'
    if name == 'Blocked share':
        c.cell(row=r, column=4).number_format = '0%'
        c.cell(row=r, column=5).number_format = '0%'
c['A9'] = 'Total weight'
c['A9'].font = BOLD
c['F9'] = '=SUM(F5:F8)'
c['F9'].number_format = '0%'
c['F9'].font = BOLD
c['G9'] = '=IF(ROUND(F9,4)=1,"OK","Weights should add up to 100%")'

c['A11'] = 'Level roles and rules (100-level system)'
c['A11'].font = Font(name=FONT, bold=True, size=12)
rules = [
    ('Level 1', 'Tap tutorial: every pair open.'),
    ('Blocks of 5 from level 2', 'Level 2-6, 7-11, 12-16, ... Slot 1 = RELAX, slot 3 = HARD, slots 2, 4, 5 = NORMAL. '
     'So relax levels are 2, 7, 12, ... and hard levels are 4, 9, 14, 19, ...'),
    ('Relax', 'Easier than every normal level of its block. Simple, open drawing; one accent pair with big dots. '
     'Exception: level 2 is the collision tutorial and must contain one block.'),
    ('Normal', 'Follows the plan: lines, depth and colours grow slowly with the level.'),
    ('Hard before 19 (levels 4, 9, 14)', 'Only a little harder: above every normal of its block and above the previous hard level.'),
    ('Hard from 19 on', 'Really hard (easy to lose): more lines, 70% of the cross lines are T, deeper blocking; above the normals of its block and the previous hard level. '
     'Big dots, if any, act as a blocker.'),
    ('Big dots', 'Only where the drawing marks a stroke (SVG data-big="1"), at most one pair per level: '
     'a decoration (relax) or a blocker (hard). Never sprinkled.'),
    ('Tutorials', 'Level 1 tap, level 2 bumping costs a heart, level 8 pinch to zoom.'),
    ('Lines per level', 'Target lines = base + X + T. Levels 1-4 are small (3, 6, 12, 16). From level 5: at least 27 (easiest), '
     'about 60 at level 19, up to 100. Normal = 27 + 60 x (1 - e^(-(level-5)/25)); relax = 0.82 x normal (min 27); '
     'early hard = last normal of the block + 3; hard from 19 = 1.18 x normal (max 100). Neighbours never jump much.'),
    ('Generator part 1: base lines', 'Pairs that fill the lines of the drawing only (inputs: pairs, colours, target difficulty). '
     'About 42% of the target lines. Lines near each other never share a colour.'),
    ('Generator part 2: overlap', 'Cross lines drawn over the picture as a pattern (inputs: X cross, T cross). '
     'X cross = crosses other lines, both dots in empty space, blocks nothing. T cross = one dot on another line (blocks it), '
     'the other dot in empty space. Never both dots on other lines. Crossing lines never share a colour. '
     'Cross lines may cross or sit on other cross lines. The two parts are generated independently.'),
    ('X / T split', 'Cross lines = target lines - base. T share of the cross lines: relax 35%, normal 50%, hard before 19 62%, '
     'hard from 19 on 70%. T lines make the level harder (blocked share = T / lines); X lines make it livelier.'),
    ('Patterns', 'The overlap must read as an ornament, not scribbles: one motif repeated at an even rhythm, mirrored when the '
     'drawing is symmetric, the original shape stays visible. Fringe (ticks at right angles along the lines), rays (towards the '
     'centre), stripes (horizontal), columns (vertical), diagonal.'),
    ('Target score', 'The same formula applied to the plan: target lines, planned depth (normal 3, +1 every 30 levels; relax -1; '
     'hard +1, +2 from level 19), blocked share = T / lines, colours.'),
    ('Rebuilt so far', 'Levels 1-10 use the 2-part generator. Levels 11-100 still hold their old layout (grey in "Level system") '
     'until they are rebuilt; block rules compare a level only with levels of the same generator.'),
]
for r, (k, v) in enumerate(rules, 12):
    c.cell(row=r, column=1, value=k).font = BOLD
    cell = c.cell(row=r, column=2, value=v)
    cell.alignment = WRAP
    c.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
    c.row_dimensions[r].height = max(32, 15 * (len(v) // 120 + 1))
for col, w in zip('ABCDEFG', [30, 34, 44, 8, 8, 9, 52]):
    c.column_dimensions[col].width = w

# Named cell references used by the formulas below.
W = {'pairs': ('$D$5', '$E$5', '$F$5'), 'depth': ('$D$6', '$E$6', '$F$6'), 'traps': ('$D$7', '$E$7', '$F$7'), 'colours': ('$D$8', '$E$8', '$F$8')}
CR = "'Difficulty criteria'!"

# ---------------------------------------------------------------- Level system
s = wb.create_sheet('Level system')
cols = ['Level', 'Block', 'Slot', 'Role', 'Tutorial', 'Image', 'Overlap pattern', 'Generator',
        'Target lines', 'Base lines', 'X cross', 'T cross', 'Colours', 'Depth', 'Blocked share', 'Target score',
        'Lines', 'Base lines', 'X cross', 'T cross', 'Colours', 'Depth', 'Blocked share', 'Open at start', 'Difficulty score',
        'Score - target', 'Lines - target',
        'Block normals min', 'Block normals max', 'Previous hard', 'Rule check', 'Game score']
GROUPS = [(1, 8, 'LEVEL'), (9, 16, 'PLAN: inputs of the generator (part 1 = base lines, part 2 = X and T cross lines)'),
          (17, 27, 'BUILT LEVEL: measured from the level file'), (28, 32, 'BLOCK RULES')]
GROUP_FILL = {1: '2E2A27', 9: '1F4E79', 17: '385723', 28: '7F6000'}
for c0, c1, title in GROUPS:
    cell = s.cell(row=1, column=c0, value=title)
    s.merge_cells(start_row=1, start_column=c0, end_row=1, end_column=c1)
    cell.font = HEAD_FONT
    cell.fill = PatternFill('solid', fgColor=GROUP_FILL[c0])
    cell.alignment = Alignment(horizontal='center', vertical='center')
    for col in range(c0, c1 + 1):
        h = s.cell(row=2, column=col, value=cols[col - 1])
        h.font = HEAD_FONT
        h.fill = PatternFill('solid', fgColor=GROUP_FILL[c0])
        h.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
s.row_dimensions[2].height = 34
n = len(rows)
first, last = 3, n + 2
L = get_column_letter


def norm(cell, key):
    lo, hi, w = (CR + x for x in W[key])
    return f'{w}*MAX(0,MIN(1,({cell}-{lo})/({hi}-{lo})))'


def rng_(col):
    return f'${col}${first}:${col}${last}'


OLD_FONT = Font(name=FONT, color='808080')
for i, r in enumerate(sorted(rows, key=lambda x: x['level']), first):
    gen = r.get('generator', 'v2 (old)')
    group = '2-part (small)' if r['level'] <= 4 else gen
    old = 'old' in gen
    pattern = (r.get('stats') or {}).get('pattern') if not old else None
    values = [r['level'], r['block'] or '-', r['slot'] or '-', r['role'], r.get('tutorial') or '', r['file'],
              pattern or ('-' if old else r.get('pattern', '-')), group,
              r['plannedPairs'], r.get('plannedBase', r['plannedPairs']), r.get('plannedX', 0), r.get('plannedT', 0), r['plannedColours'], r.get('plannedDepth', 3)]
    for col, v in enumerate(values, 1):
        s.cell(row=i, column=col, value=v)
    s.cell(row=i, column=15, value=f'=L{i}/I{i}').number_format = '0%'
    s.cell(row=i, column=16, value=f'=ROUND(100*({norm(f"I{i}", "pairs")}+{norm(f"N{i}", "depth")}+{norm(f"O{i}", "traps")}+{norm(f"M{i}", "colours")}),0)')
    # measured (from the build)
    for col, v in [(17, r['pairs']), (18, r.get('baseLines', r['pairs'])), (19, r.get('xLines', 0)), (20, r.get('tLines', 0)), (21, r['colours']), (22, r['depth']), (23, r['traps'])]:
        s.cell(row=i, column=col, value=v)
    s.cell(row=i, column=23).number_format = '0%'
    s.cell(row=i, column=24, value=f'=1-W{i}').number_format = '0%'
    s.cell(row=i, column=25, value=f'=ROUND(100*({norm(f"Q{i}", "pairs")}+{norm(f"V{i}", "depth")}+{norm(f"W{i}", "traps")}+{norm(f"U{i}", "colours")}),0)')
    s.cell(row=i, column=26, value=f'=Y{i}-P{i}')
    s.cell(row=i, column=27, value=f'=Q{i}-I{i}')
    same = f'{rng_("B")},B{i},{rng_("D")},"normal",{rng_("H")},H{i}'
    s.cell(row=i, column=28, value=f'=IF(COUNTIFS({same})=0,"-",_xlfn.MINIFS({rng_("Y")},{same}))')
    s.cell(row=i, column=29, value=f'=IF(COUNTIFS({same})=0,"-",_xlfn.MAXIFS({rng_("Y")},{same}))')
    prev = f'{rng_("D")},"hard",{rng_("A")},"<"&A{i},{rng_("H")},H{i}'
    s.cell(row=i, column=30, value=f'=IF(COUNTIFS({prev})=0,"-",_xlfn.MAXIFS({rng_("Y")},{prev}))')
    pre = 'Old layout, rebuild: ' if old else ''
    s.cell(row=i, column=31, value=(
        f'=IF(D{i}="relax",IF(OR(A{i}=2,AB{i}="-",Y{i}<AB{i}),"OK","{pre}relax not easier than block normals"),'
        f'IF(D{i}="hard",IF(AND(OR(AC{i}="-",Y{i}>AC{i}),OR(AD{i}="-",Y{i}>AD{i})),"OK","{pre}hard not above normals / previous hard"),"OK"))'))
    s.cell(row=i, column=32, value=r['score'])
    fill = PatternFill('solid', fgColor=ROLE_FILL[r['role']])
    for col in range(1, len(cols) + 1):
        cell = s.cell(row=i, column=col)
        cell.font = BLUE if 9 <= col <= 14 else (OLD_FONT if old and col >= 17 else NORMAL)
        cell.border = BORDER
        if col <= 8:
            cell.fill = fill
        elif 9 <= col <= 14:
            cell.fill = INPUT_FILL
s.cell(row=2, column=7).comment = Comment('Pattern of the overlap (generator part 2). For rebuilt levels: the pattern actually used.', 'Dot Line')
s.cell(row=2, column=8).comment = Comment('2-part = base lines + overlap pattern (new). "old" = still the previous layout, to be rebuilt. Block rules compare levels of the same group only.', 'Dot Line')
s.cell(row=2, column=9).comment = Comment('Target lines = base + X + T (plan: tools/level-plan.ts). Blue cells are the plan; the level build reads the plan from the code, edit it there.', 'Dot Line')
s.cell(row=2, column=15).comment = Comment('Planned blocked share = T cross / target lines (each T line blocks one line).', 'Dot Line')
s.cell(row=2, column=16).comment = Comment('The difficulty formula applied to the plan (lines, depth, blocked share, colours).', 'Dot Line')
s.cell(row=2, column=23).comment = Comment('Share of lines that bump something if tapped at the start (trap share of the game code).', 'Dot Line')
s.cell(row=2, column=25).comment = Comment('Recomputed here from the measured criteria and the weights on "Difficulty criteria".', 'Dot Line')
s.cell(row=2, column=32).comment = Comment('Score computed by the game code at build time (should equal "Difficulty score" while the weights are unchanged).', 'Dot Line')
s.conditional_formatting.add(f'AE{first}:AE{last}', CellIsRule(operator='notEqual', formula=['"OK"'], fill=PatternFill('solid', fgColor='F8CBAD')))
s.conditional_formatting.add(f'AA{first}:AA{last}', CellIsRule(operator='notEqual', formula=['0'], fill=PatternFill('solid', fgColor='FFE699')))
widths = [7, 7, 6, 9, 10, 24, 18, 14, 8, 8, 7, 7, 8, 7, 9, 8, 7, 7, 7, 7, 8, 7, 9, 9, 10, 8, 8, 10, 10, 9, 44, 8]
for i, w in enumerate(widths, 1):
    s.column_dimensions[L(i)].width = w
s.freeze_panes = 'G3'
# Summary + chart
two = f'--(LEFT({rng_("H")},6)="2-part")'
summary = [
    ('Rule checks OK', f'=COUNTIF(AE{first}:AE{last},"OK")&" / "&COUNTA(AE{first}:AE{last})', None),
    ('Levels on the 2-part generator', f'=SUMPRODUCT({two})', '0'),
    ('2-part levels with every planned line placed', f'=SUMPRODUCT({two},--({rng_("AA")}=0),--({rng_("R")}={rng_("J")}),--({rng_("S")}={rng_("K")}),--({rng_("T")}={rng_("L")}))', '0'),
    ('Mean |score - target|, 2-part levels', f'=SUMPRODUCT({two},ABS({rng_("Z")}))/SUMPRODUCT({two})', '0.0'),
    ('Mean open at start, 2-part levels', f'=SUMPRODUCT({two},{rng_("X")})/SUMPRODUCT({two})', '0%'),
]
for k, (label, formula, fmt) in enumerate(summary):
    s.cell(row=last + 2 + k, column=1, value=label).font = BOLD
    cell = s.cell(row=last + 2 + k, column=9, value=formula)
    if fmt:
        cell.number_format = fmt
chart = LineChart()
chart.title = 'Difficulty by level: target vs built'
chart.y_axis.title = 'Score'
chart.x_axis.title = 'Level'
chart.height, chart.width = 9, 26
chart.add_data(Reference(s, min_col=16, min_row=2, max_row=last), titles_from_data=True)
chart.add_data(Reference(s, min_col=25, min_row=2, max_row=last), titles_from_data=True)
chart.set_categories(Reference(s, min_col=1, min_row=first, max_row=last))
chart.roundedCorners = False
chart.legend.overlay = False
chart.title.overlay = False
chart.x_axis.delete = False
chart.y_axis.delete = False
chart.x_axis.title.overlay = False
chart.y_axis.title.overlay = False
s.add_chart(chart, f'A{last + 9}')
lines = LineChart()
lines.title = 'Lines by level: base, X cross and T cross (plan)'
lines.y_axis.title = 'Lines'
lines.x_axis.title = 'Level'
lines.height, lines.width = 9, 26
for col in (9, 10, 11, 12):
    lines.add_data(Reference(s, min_col=col, min_row=2, max_row=last), titles_from_data=True)
lines.set_categories(Reference(s, min_col=1, min_row=first, max_row=last))
lines.roundedCorners = False
lines.legend.overlay = False
lines.title.overlay = False
lines.x_axis.delete = False
lines.y_axis.delete = False
lines.x_axis.title.overlay = False
lines.y_axis.title.overlay = False
s.add_chart(lines, f'Q{last + 9}')

# ---------------------------------------------------------------- Images
im = wb.create_sheet('Images')
icols = ['Level', 'Role', 'Image file', 'Subject', 'Description (what to draw)', 'What this slot needs', 'Overlap pattern (hoa văn)', 'Strokes in SVG',
         'Big-dot strokes', 'Big dots role', 'Lines', 'Base', 'X cross', 'T cross', 'Colours', 'Blocking depth', 'Difficulty score']
PATTERN_VI = {
    'fringe': 'Tua rua: nét ngắn vuông góc với viền, cách đều, đối xứng hai bên',
    'rays': 'Tia: nét hướng về tâm hình, cách đều quanh viền (như vạch đồng hồ)',
    'stripes': 'Sọc ngang: các nét song song nằm ngang, cách đều',
    'columns': 'Sọc dọc: các nét song song thẳng đứng, cách đều',
    'diagonal': 'Sọc chéo đối xứng (hình chữ V)',
    'auto': 'Chưa chọn (level chưa build lại)',
}
for i, h in enumerate(icols, 1):
    cell = im.cell(row=1, column=i, value=h)
    cell.font = HEAD_FONT
    cell.fill = HEAD_FILL
    cell.alignment = Alignment(wrap_text=True, vertical='center')
NEEDS = {
    'tutorial': 'Rất đơn giản, mọi cặp đều mở (không chữ T). Dạy bấm.',
    'relax': 'Hình quen thuộc, thoáng, ít chữ T, ít nét cắt nhau. Đúng 1 cặp bóng to làm điểm nhấn trang trí.',
    'normal': 'Hình quen thuộc, độ phức tạp tăng dần theo level; vài chữ T (chi tiết chạm khung) và chỗ nét cắt nhau.',
    'hard': 'Hình dạng lưới / nan hoa / khung có nhiều chữ T lồng nhau và nhiều chỗ nét cắt nhau; bóng to (nếu có) là chốt chặn.',
}
for i, r in enumerate(sorted(rows, key=lambda x: x['level']), 2):
    need = NEEDS[r['role']]
    if r['level'] in (4, 9, 14):
        need = 'Khó nhẹ: chỉ vài chữ T (khó hơn level thường cùng bộ một chút).'
    if r['level'] == 2:
        need = 'Hướng dẫn va chạm: đúng 1 chỗ chữ T rõ ràng. ' + NEEDS['relax']
    j = i + 1  # the level table starts one row lower (two header rows)
    hoa = 'Không có: level hướng dẫn bấm, chỉ có nét của hình' if r.get('plannedX', 0) + r.get('plannedT', 0) == 0 and r['level'] <= 10 else PATTERN_VI.get(r.get('pattern', 'auto'), '-')
    vals = [r['level'], r['role'], r['file'], r['name'], r['desc'], need, hoa, r['strokes'], r['bigStrokes'],
            {'none': '-', 'accent': 'Trang trí', 'blocker': 'Chốt chặn'}.get(r.get('bigDotsPlan', 'none'), '-'),
            f"='Level system'!Q{j}", f"='Level system'!R{j}", f"='Level system'!S{j}", f"='Level system'!T{j}", f"='Level system'!U{j}", f"='Level system'!V{j}", f"='Level system'!Y{j}"]
    for col, v in enumerate(vals, 1):
        cell = im.cell(row=i, column=col, value=v)
        cell.font = Font(name=FONT, color='008000') if isinstance(v, str) and v.startswith("='Level system'") else NORMAL
        cell.border = BORDER
        cell.alignment = WRAP
        if col <= 2:
            cell.fill = PatternFill('solid', fgColor=ROLE_FILL[r['role']])
    im.row_dimensions[i].height = 44
for i, w in enumerate([7, 9, 24, 18, 60, 46, 40, 9, 9, 11, 7, 7, 7, 7, 8, 9, 10], 1):
    im.column_dimensions[get_column_letter(i)].width = w
im.freeze_panes = 'C2'
im.cell(row=len(rows) + 3, column=1, value='Images live in art/levels/ (one SVG per level). Replace or edit a file, then run npm run levels:build (and this export) to regenerate that level. '
        'SVG rules: a stroke ending exactly on another stroke = T-junction (blocking); crossing strokes never block unless the generator puts a dot on the crossing; '
        'never let two strokes overlap along an edge; data-big="1" on a stroke = its pair gets big dots.').alignment = WRAP
im.merge_cells(start_row=len(rows) + 3, start_column=1, end_row=len(rows) + 3, end_column=8)
im.row_dimensions[len(rows) + 3].height = 60

out = os.path.join(ROOT, 'design', 'level-system.xlsx')
wb.save(out)
print('wrote', out)
