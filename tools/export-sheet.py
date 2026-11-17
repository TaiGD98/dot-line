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
    ('Pairs', 'Number of pairs on the board', 'Count of pairs in the level file', 3, 45, 0.30,
     'More dots and lines to read, more to plan, longer level.'),
    ('Blocking depth', 'Longest chain of blocks', 'Rounds needed when every open pair is cleared each round (solver)', 1, 6, 0.30,
     'Deep chains mean the player must find the right order several steps ahead.'),
    ('Trap share', 'Dots that bump something if tapped first', 'Blocked dot sides at the start / (2 x pairs)', 0, 0.6, 0.30,
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
    if name == 'Trap share':
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
    ('Normal', 'Follows the base curve: target 10 at level 2 rising to 55 at level 100.'),
    ('Hard before 19 (levels 4, 9, 14)', 'Only a little harder: above every normal of its block and above the previous hard level.'),
    ('Hard from 19 on', 'Really hard (easy to lose): base curve + 20, max 85, above the normals of its block and the previous hard level. '
     'Big dots, if any, act as a blocker.'),
    ('Big dots', 'Only where the drawing marks a stroke (SVG data-big="1"), at most one pair per level: '
     'a decoration (relax) or a blocker (hard). Never sprinkled.'),
    ('Tutorials', 'Level 1 tap, level 2 bumping costs a heart, level 8 pinch to zoom.'),
]
for r, (k, v) in enumerate(rules, 12):
    c.cell(row=r, column=1, value=k).font = BOLD
    cell = c.cell(row=r, column=2, value=v)
    cell.alignment = WRAP
    c.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
    c.row_dimensions[r].height = 32
for col, w in zip('ABCDEFG', [30, 34, 44, 8, 8, 9, 52]):
    c.column_dimensions[col].width = w

# Named cell references used by the formulas below.
W = {'pairs': ('$D$5', '$E$5', '$F$5'), 'depth': ('$D$6', '$E$6', '$F$6'), 'traps': ('$D$7', '$E$7', '$F$7'), 'colours': ('$D$8', '$E$8', '$F$8')}
CR = "'Difficulty criteria'!"

# ---------------------------------------------------------------- Level system
s = wb.create_sheet('Level system')
cols = ['Level', 'Block', 'Slot', 'Role', 'Tutorial', 'Image', 'Target score', 'Planned pairs', 'Planned colours',
        'Big dots', 'Pairs', 'Colours', 'Blocking depth', 'Trap share', 'Big dots (count)', 'Difficulty score',
        'Score - target', 'Block normals min', 'Block normals max', 'Previous hard', 'Rule check', 'Game score']
for i, h in enumerate(cols, 1):
    cell = s.cell(row=1, column=i, value=h)
    cell.font = HEAD_FONT
    cell.fill = HEAD_FILL
    cell.alignment = Alignment(wrap_text=True, vertical='center')
s.row_dimensions[1].height = 34
n = len(rows)
last = n + 1


def norm(cell, key):
    lo, hi, w = (CR + x for x in W[key])
    return f'{w}*MAX(0,MIN(1,({cell}-{lo})/({hi}-{lo})))'


for i, r in enumerate(sorted(rows, key=lambda x: x['level']), 2):
    values = [r['level'], r['block'] or '-', r['slot'] or '-', r['role'], r.get('tutorial') or '', r['file'], r['target'], r['plannedPairs'], r['plannedColours'],
              {'none': '-', 'accent': 'Accent', 'blocker': 'Blocker'}.get(r.get('bigDotsPlan', ''), '-')]
    for col, v in enumerate(values, 1):
        s.cell(row=i, column=col, value=v)
    # measured (from the build)
    for col, v in [(11, r['pairs']), (12, r['colours']), (13, r['depth']), (14, r['traps']), (15, r['bigDots'])]:
        s.cell(row=i, column=col, value=v)
    s.cell(row=i, column=14).number_format = '0.0%'
    s.cell(row=i, column=16, value=f'=ROUND(100*({norm(f"K{i}", "pairs")}+{norm(f"M{i}", "depth")}+{norm(f"N{i}", "traps")}+{norm(f"L{i}", "colours")}),0)')
    s.cell(row=i, column=17, value=f'=P{i}-G{i}')
    s.cell(row=i, column=18, value=f'=_xlfn.MINIFS($P$2:$P${last},$B$2:$B${last},B{i},$D$2:$D${last},"normal")')
    s.cell(row=i, column=19, value=f'=_xlfn.MAXIFS($P$2:$P${last},$B$2:$B${last},B{i},$D$2:$D${last},"normal")')
    s.cell(row=i, column=20, value=f'=IF(COUNTIFS($D$2:$D${last},"hard",$A$2:$A${last},"<"&A{i})=0,"-",_xlfn.MAXIFS($P$2:$P${last},$D$2:$D${last},"hard",$A$2:$A${last},"<"&A{i}))')
    s.cell(row=i, column=21, value=(
        f'=IF(D{i}="relax",IF(OR(A{i}=2,P{i}<R{i}),"OK","Relax not easier than block normals"),'
        f'IF(D{i}="hard",IF(AND(P{i}>S{i},OR(T{i}="-",P{i}>T{i})),"OK","Hard not above normals / previous hard"),"OK"))'))
    s.cell(row=i, column=22, value=r['score'])
    fill = PatternFill('solid', fgColor=ROLE_FILL[r['role']])
    for col in range(1, len(cols) + 1):
        cell = s.cell(row=i, column=col)
        cell.font = NORMAL
        cell.border = BORDER
        if col <= 10:
            cell.fill = fill
s.cell(row=1, column=7).comment = Comment('Plan from tools/level-plan.ts (normal curve 10 -> 55, relax -8, early hard +4, real hard +20).', 'Dot Line')
s.cell(row=1, column=16).comment = Comment('Recomputed here from the measured criteria and the weights on "Difficulty criteria".', 'Dot Line')
s.cell(row=1, column=22).comment = Comment('Score computed by the game code at build time (should equal "Difficulty score" while the weights are unchanged).', 'Dot Line')
s.conditional_formatting.add(f'U2:U{last}', CellIsRule(operator='notEqual', formula=['"OK"'], fill=PatternFill('solid', fgColor='F8CBAD')))
widths = [7, 7, 6, 9, 10, 26, 9, 9, 9, 9, 7, 8, 9, 9, 9, 10, 9, 10, 10, 9, 30, 8]
for i, w in enumerate(widths, 1):
    s.column_dimensions[get_column_letter(i)].width = w
s.freeze_panes = 'B2'
# Summary + chart
s.cell(row=last + 2, column=1, value='Rule checks OK').font = BOLD
s.cell(row=last + 2, column=4, value=f'=COUNTIF(U2:U{last},"OK")&" / "&COUNTA(U2:U{last})')
s.cell(row=last + 3, column=1, value='Mean |score - target|').font = BOLD
s.cell(row=last + 3, column=4, value=f'=SUMPRODUCT(ABS(Q2:Q{last}))/COUNT(Q2:Q{last})')
s.cell(row=last + 3, column=4).number_format = '0.0'
chart = LineChart()
chart.title = 'Difficulty by level: target vs achieved'
chart.y_axis.title = 'Score'
chart.x_axis.title = 'Level'
chart.height, chart.width = 9, 26
chart.add_data(Reference(s, min_col=7, min_row=1, max_row=last), titles_from_data=True)
chart.add_data(Reference(s, min_col=16, min_row=1, max_row=last), titles_from_data=True)
chart.set_categories(Reference(s, min_col=1, min_row=2, max_row=last))
chart.roundedCorners = False
chart.legend.overlay = False
chart.title.overlay = False
chart.x_axis.delete = False
chart.y_axis.delete = False
chart.x_axis.title.overlay = False
chart.y_axis.title.overlay = False
s.add_chart(chart, f'X2')

# ---------------------------------------------------------------- Images
im = wb.create_sheet('Images')
icols = ['Level', 'Role', 'Image file', 'Subject', 'Description (what to draw)', 'What this slot needs', 'Strokes in SVG',
         'Big-dot strokes', 'Big dots role', 'Pairs', 'Colours', 'Blocking depth', 'Difficulty score']
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
    vals = [r['level'], r['role'], r['file'], r['name'], r['desc'], need, r['strokes'], r['bigStrokes'],
            {'none': '-', 'accent': 'Trang trí', 'blocker': 'Chốt chặn'}.get(r.get('bigDotsPlan', 'none'), '-'),
            f"='Level system'!K{i}", f"='Level system'!L{i}", f"='Level system'!M{i}", f"='Level system'!P{i}"]
    for col, v in enumerate(vals, 1):
        cell = im.cell(row=i, column=col, value=v)
        cell.font = Font(name=FONT, color='008000') if isinstance(v, str) and v.startswith("='Level system'") else NORMAL
        cell.border = BORDER
        cell.alignment = WRAP
        if col <= 2:
            cell.fill = PatternFill('solid', fgColor=ROLE_FILL[r['role']])
    im.row_dimensions[i].height = 44
for i, w in enumerate([7, 9, 24, 18, 60, 46, 9, 9, 11, 7, 8, 9, 10], 1):
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
