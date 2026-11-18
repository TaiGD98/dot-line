"""Exports design/silhouette-level-difficulty.xlsx from design/silhouette-levels-report.json
(written by: npm run levels:silhouettes).

Sheets:
  Level difficulty  - the designer's rules (difficulty 0-3, the two constants, the hard / relax rhythm) as
                      editable inputs (blue), the 100 levels (plan, what was built) and checks by formula
  Patterns          - the fill patterns and dot sizes in rotation, how often each is used
  Fit to silhouette - per level: lines inside the black, edges traced, area filled

Run: python3 tools/export-silhouette-sheet.py
"""
import json
import os
from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
report = json.load(open(os.path.join(ROOT, 'design', 'silhouette-levels-report.json')))
rows = [r for r in report['levels'] if r]
rules = report['rules']

FONT = 'Arial'
BLUE = Font(name=FONT, color='0000FF')
BOLD = Font(name=FONT, bold=True)
NORMAL = Font(name=FONT)
GREY = Font(name=FONT, color='808080', italic=True)
HEAD_FILL = PatternFill('solid', fgColor='2E2A27')
HEAD_FONT = Font(name=FONT, bold=True, color='FFFFFF')
INPUT_FILL = PatternFill('solid', fgColor='FFF2CC')
ROLE_FILL = {'relax': 'E2F0D9', 'hard': 'FCE4D6', 'normal': 'FFFFFF', 'tutorial': 'DDEBF7'}
BAD_FILL = PatternFill('solid', fgColor='F8CBAD')
BAD_FONT = Font(name=FONT, color='9C0006')
thin = Side(style='thin', color='D9D9D9')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)

wb = Workbook()


def head(ws, row, labels, height=44):
    for i, h in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = HEAD_FONT
        c.fill = HEAD_FILL
        c.alignment = CENTER
        c.border = BORDER
    ws.row_dimensions[row].height = height


# ================================================================ Level difficulty
ws = wb.active
ws.title = 'Level difficulty'
ws['A1'] = 'Dot Line: level difficulty (silhouette levels)'
ws['A1'].font = Font(name=FONT, bold=True, size=14)
ws['A2'] = ('Blue cells on yellow are the rules: change them and the checks below recalculate. Black numbers in the level '
            'table are what the builder produced (design/silhouette-levels-report.json, npm run levels:silhouettes). '
            'To change a level, change the plan in tools/silhouette/plan.ts and rebuild; then run this export again.')
ws['A2'].alignment = WRAP
ws['A2'].font = NORMAL
ws.merge_cells('A2:P2')
ws.row_dimensions[2].height = 46

# ---- rules by difficulty
ws['A4'] = '1. Difficulty grows with the number of lines and the depth'
ws['A4'].font = Font(name=FONT, bold=True, size=12)
head(ws, 5, ['Difficulty', 'Name', 'Lines (median, rule)', 'Depth (rule)', 'Depth / lines', 'Levels built', 'Lines (median, built)',
             'Depth (median, built)', 'Lines OK?', 'Note'])
TIER_ROW0 = 6
notes = {
    0: 'Levels 1-3 are tutorials (3, 5, 8 lines) and are left out of the median. Relax levels (after each hard one) are easier.',
    1: 'Hard levels. Levels 9 and 14 are a soft start (42 and 50 lines, no label).',
    2: 'Very hard levels.',
    3: 'Super hard levels.'
}
for i, t in enumerate(rules['tiers']):
    r = TIER_ROW0 + i
    vals = [t['difficulty'], t['name'], t['lines'], t['depth'], None, None, None, None, None, notes[t['difficulty']]]
    for col, v in enumerate(vals, 1):
        c = ws.cell(row=r, column=col, value=v)
        c.font = BLUE if col in (3, 4) else NORMAL
        c.border = BORDER
        c.alignment = WRAP if col == 10 else Alignment(vertical='top')
        if col in (3, 4):
            c.fill = INPUT_FILL
    ws.cell(row=r, column=5, value=f'=D{r}/C{r}').number_format = '0.00'
ws.merge_cells(start_row=TIER_ROW0, start_column=10, end_row=TIER_ROW0, end_column=16)
for i in range(1, 4):
    ws.merge_cells(start_row=TIER_ROW0 + i, start_column=10, end_row=TIER_ROW0 + i, end_column=16)
ws.cell(row=TIER_ROW0, column=3).comment = Comment('Designer rule (2026-11-18): median lines 27 / 62 / 79 / 113 for difficulty 0-3, '
                                                   'measured on the reference levels (levels/chapter-2-ref, 497 levels).', 'Dot Line')
ws.cell(row=TIER_ROW0, column=4).comment = Comment('Median blocking depth of the reference levels per difficulty: 7 / 10 / 16 / 18 '
                                                   '(research/ref-patterns.md, section 2).', 'Dot Line')

# ---- constants
ws['A11'] = '2. The same at every difficulty'
ws['A11'].font = Font(name=FONT, bold=True, size=12)
head(ws, 12, ['Number', 'What it means', 'Min', 'Target', 'Max', 'Built (average)', 'Levels inside', 'Share inside', '', 'Note'], 32)
CONST_ROW = 13
consts = [
    ('Blocks per line', 'How many other lines have a dot sitting on a line (it must wait for them)', rules['constants']['blocksPerLine'], '0.00',
     'Designer rule: each line is blocked about 1.3-1.5 times, at every difficulty.'),
    ('Open at start', 'Share of the lines that can be cleared right away', rules['constants']['openShare'], '0%',
     'Designer rule: about 1/3 of the lines are open at the start, at every difficulty.')
]
for i, (name, what, band, fmt, note) in enumerate(consts):
    r = CONST_ROW + i
    for col, v in enumerate([name, what, band['min'], band['target'], band['max']], 1):
        c = ws.cell(row=r, column=col, value=v)
        c.font = BLUE if col >= 3 else NORMAL
        c.border = BORDER
        c.alignment = WRAP
        if col >= 3:
            c.fill = INPUT_FILL
            c.number_format = fmt
    ws.cell(row=r, column=10, value=note).alignment = WRAP
    ws.merge_cells(start_row=r, start_column=10, end_row=r, end_column=16)
    ws.row_dimensions[r].height = 32

# ---- rhythm
ws['A16'] = '3. Rhythm'
ws['A16'].font = Font(name=FONT, bold=True, size=12)
rhythm = [
    ('Tutorials', 'Levels 1, 2, 3: tap (3 lines, nothing blocked), bumping (5 lines), a first chain (8 lines). They may have fewer lines than any rule above.'),
    ('Hard levels', 'Every fifth level from 9: 9, 14, 19, ... 99.'),
    ('"Hard" label', None),
    ('Relax levels', 'The level right after a hard one (10, 15, 20, ... 100) is easy and simple: fewer lines than the normal levels '
                     'around it, a simple pattern (straight lines or nested outlines) and big dots.'),
    ('Normal levels', 'Everything else: 20 lines at level 4, growing to 34 at level 98 (median 27).')
]
for i, (k, v) in enumerate(rhythm):
    r = 17 + i
    ws.cell(row=r, column=1, value=k).font = BOLD
    c = ws.cell(row=r, column=2, value=v)
    c.alignment = WRAP
    c.font = NORMAL
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=9)
    ws.row_dimensions[r].height = 30
LABEL_ROW = 19
ws.unmerge_cells(start_row=LABEL_ROW, start_column=2, end_row=LABEL_ROW, end_column=9)
ws.cell(row=LABEL_ROW, column=2, value='Shown on hard levels from level').font = NORMAL
c = ws.cell(row=LABEL_ROW, column=3, value=rules['hardLabelFrom'])
c.font = BLUE
c.fill = INPUT_FILL
c.border = BORDER
c.comment = Comment('Designer rule: the "Hard" label starts at level 19. Levels 9 and 14 are hard slots without the label.', 'Dot Line')
ws.cell(row=LABEL_ROW, column=4, value='on (levels 9 and 14 are hard slots without the label).').font = NORMAL

# ---- level table
T0 = 24  # header row
ws.cell(row=T0 - 1, column=1, value='4. The 100 levels').font = Font(name=FONT, bold=True, size=12)
cols = ['Level', 'Role', 'Difficulty', '"Hard" label', 'Picture', 'Pattern', 'Dot size', 'Lines (plan)', 'Depth (plan)',
        'Lines (built)', 'Depth (built)', 'Open at start', 'Blocks per line', 'Blocked by 0 / 1 / 2 / 3+ lines', 'Colours', 'Board (px)',
        'Lines vs plan', 'Blocks in band?', 'Open in band?', 'Rhythm OK?', 'Lines if difficulty 0', 'Lines if difficulty 1',
        'Lines if difficulty 2', 'Lines if difficulty 3', 'Depth if d0', 'Depth if d1', 'Depth if d2', 'Depth if d3']
head(ws, T0, cols, 58)
first = T0 + 1
last = T0 + len(rows)
for i, r in enumerate(rows):
    x = first + i
    b = r.get('built') or {}
    hist = b.get('blockedBy')
    vals = [r['level'], r['role'], r['difficulty'], 'yes' if r['label'] else '', r.get('name', r['art']), r['pattern'], r['style'],
            r['lines'], r['depth'], b.get('lines'), b.get('depth'), b.get('open'), b.get('blocksPerLine'),
            ' / '.join(str(v) for v in hist) if hist else None, b.get('colours'), b.get('board')]
    for col, v in enumerate(vals, 1):
        c = ws.cell(row=x, column=col, value=v)
        c.font = BLUE if col in (8, 9) else NORMAL
        c.border = BORDER
        if col in (8, 9):
            c.fill = INPUT_FILL
        elif col <= 7:
            c.fill = PatternFill('solid', fgColor=ROLE_FILL[r['role']])
    ws.cell(row=x, column=12).number_format = '0%'
    ws.cell(row=x, column=13).number_format = '0.00'
    # checks (formulas)
    ws.cell(row=x, column=17, value=f'=IF(J{x}="","not built",(J{x}-H{x})/H{x})').number_format = '+0%;-0%;0%'
    ws.cell(row=x, column=18, value=f'=IF(M{x}="","",IF(B{x}="tutorial","tutorial",IF(AND(M{x}>=$C${CONST_ROW},M{x}<=$E${CONST_ROW}),"OK",IF(M{x}<$C${CONST_ROW},"low","high"))))')
    ws.cell(row=x, column=19, value=f'=IF(L{x}="","",IF(B{x}="tutorial","tutorial",IF(AND(L{x}>=$C${CONST_ROW + 1},L{x}<=$E${CONST_ROW + 1}),"OK",IF(L{x}<$C${CONST_ROW + 1},"low","high"))))')
    # rhythm: a hard level has more lines than both neighbours, a relax level fewer than the next normal one
    if r['role'] == 'hard':
        ws.cell(row=x, column=20, value=f'=IF(J{x}="","",IF(AND(J{x}>J{x - 1},J{x}>J{x + 1}),"OK","not above its neighbours"))')
    elif r['role'] == 'relax':
        nxt = f'J{x + 1}' if x < last else f'J{x - 2}'
        ws.cell(row=x, column=20, value=f'=IF(J{x}="","",IF(AND(J{x}<J{x - 1},J{x}<={nxt}),"OK","not easier than its neighbours"))')
    else:
        ws.cell(row=x, column=20, value='')
    # helper columns for the medians (levels 1-3 are tutorials and stay out)
    for d in range(4):
        ws.cell(row=x, column=21 + d, value=f'=IF(AND($C{x}={d},$B{x}<>"tutorial",$B{x}<>"relax",$J{x}<>""),$J{x},"")').font = GREY
        ws.cell(row=x, column=25 + d, value=f'=IF(AND($C{x}={d},$B{x}<>"tutorial",$B{x}<>"relax",$K{x}<>""),$K{x},"")').font = GREY
    for col in range(17, 21):
        ws.cell(row=x, column=col).font = NORMAL
        ws.cell(row=x, column=col).border = BORDER

# summary formulas that read the table
for i in range(4):
    r = TIER_ROW0 + i
    lc = get_column_letter(21 + i)
    dc = get_column_letter(25 + i)
    ws.cell(row=r, column=6, value=f'=COUNT({lc}{first}:{lc}{last})')
    ws.cell(row=r, column=7, value=f'=IF(F{r}=0,"",MEDIAN({lc}{first}:{lc}{last}))').number_format = '0.0'
    ws.cell(row=r, column=8, value=f'=IF(F{r}=0,"",MEDIAN({dc}{first}:{dc}{last}))').number_format = '0.0'
    ws.cell(row=r, column=9, value=f'=IF(F{r}=0,"",IF(ABS(G{r}-C{r})/C{r}<=0.1,"OK","median off by more than 10%"))')
    for col in range(5, 10):
        ws.cell(row=r, column=col).border = BORDER
        ws.cell(row=r, column=col).font = NORMAL
for i, col_letter in enumerate(['M', 'L']):
    r = CONST_ROW + i
    rng = f'{col_letter}{first + 3}:{col_letter}{last}'  # tutorials (levels 1-3) left out
    ws.cell(row=r, column=6, value=f'=AVERAGE({rng})').number_format = '0.00' if i == 0 else '0%'
    ws.cell(row=r, column=7, value=f'=COUNTIFS({rng},">="&C{r},{rng},"<="&E{r})')
    ws.cell(row=r, column=8, value=f'=G{r}/COUNT({rng})').number_format = '0%'
    for col in range(6, 9):
        ws.cell(row=r, column=col).border = BORDER
        ws.cell(row=r, column=col).font = NORMAL

# conditional formats
band = f'{get_column_letter(18)}{first}:{get_column_letter(20)}{last}'
ws.conditional_formatting.add(band, FormulaRule(formula=[f'AND(R{first}<>"",R{first}<>"OK",R{first}<>"tutorial")'], fill=BAD_FILL, font=BAD_FONT))
ws.conditional_formatting.add(f'Q{first}:Q{last}', FormulaRule(formula=[f'AND(ISNUMBER(Q{first}),ABS(Q{first})>0.15)'], fill=BAD_FILL, font=BAD_FONT))
ws.conditional_formatting.add(f'I{TIER_ROW0}:I{TIER_ROW0 + 3}', CellIsRule(operator='notEqual', formula=['"OK"'], fill=BAD_FILL, font=BAD_FONT))

widths = [8, 10, 10, 9, 20, 15, 9, 9, 9, 9, 9, 9, 9, 16, 9, 9, 10, 11, 10, 22, 8, 8, 8, 8, 8, 8, 8, 8]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.column_dimensions['B'].width = 30
ws.column_dimensions['B'].width = 12
ws.freeze_panes = ws.cell(row=first, column=6)
ws.cell(row=T0, column=21).comment = Comment('Helper columns for the medians in section 1 (tutorials and relax levels left out).', 'Dot Line')

# chart: lines per level, plan and built
ch = LineChart()
ch.title = 'Lines per level: plan and built'
ch.y_axis.title = 'Lines'
ch.x_axis.title = 'Level'
ch.height = 9
ch.width = 30
ch.add_data(Reference(ws, min_col=8, min_row=T0, max_row=last), titles_from_data=True)
ch.add_data(Reference(ws, min_col=10, min_row=T0, max_row=last), titles_from_data=True)
ch.set_categories(Reference(ws, min_col=1, min_row=first, max_row=last))
ch.roundedCorners = False
ch.legend.overlay = False
ch.title.overlay = False
ch.x_axis.title.overlay = False
ch.y_axis.title.overlay = False
ch.x_axis.delete = False
ch.y_axis.delete = False
ws.add_chart(ch, f'AD{T0}')

# ================================================================ Patterns
ps = wb.create_sheet('Patterns')
ps['A1'] = 'Fill patterns and dot sizes in rotation'
ps['A1'].font = Font(name=FONT, bold=True, size=14)
ps['A2'] = ('Every level fills its silhouette with one pattern; the pattern changes from level to level (tools/silhouette/plan.ts). '
            'Patterns differ in line length, in how lines meet (free tips, Ts, crossings) and in dot size. Learned from the reference '
            'levels (research/ref-patterns.md): line ends sit ON other lines (a T blocks), a third of the ends are free tips, '
            'crossings never block, neighbours never share a colour.')
ps['A2'].alignment = WRAP
ps['A2'].font = NORMAL
ps.merge_cells('A2:F2')
ps.row_dimensions[2].height = 62
head(ps, 4, ['Pattern', 'What it looks like', 'For relax / tutorial levels', 'Levels using it', 'Average lines', 'Average blocks per line'], 34)
lv = "'Level difficulty'"
for i, p in enumerate(rules['patterns']):
    r = 5 + i
    ps.cell(row=r, column=1, value=p['name']).font = BOLD
    c = ps.cell(row=r, column=2, value=p['describe'])
    c.alignment = WRAP
    c.font = NORMAL
    ps.cell(row=r, column=3, value='yes' if p['simple'] else '').font = NORMAL
    ps.cell(row=r, column=4, value=f'=COUNTIF({lv}!$F${first}:$F${last},A{r})').font = NORMAL
    ps.cell(row=r, column=5, value=f'=IF(D{r}=0,"",AVERAGEIF({lv}!$F${first}:$F${last},A{r},{lv}!$J${first}:$J${last}))').number_format = '0.0'
    ps.cell(row=r, column=6, value=f'=IF(D{r}=0,"",AVERAGEIF({lv}!$F${first}:$F${last},A{r},{lv}!$M${first}:$M${last}))').number_format = '0.00'
    for col in range(1, 7):
        ps.cell(row=r, column=col).border = BORDER
pe = 5 + len(rules['patterns'])
ps.cell(row=pe, column=1, value='Total').font = BOLD
ps.cell(row=pe, column=4, value=f'=SUM(D5:D{pe - 1})').font = BOLD

s0 = pe + 3
ps.cell(row=s0 - 1, column=1, value='Dot sizes').font = Font(name=FONT, bold=True, size=12)
head(ps, s0, ['Dot size', 'Dot radius (px)', 'Distance between neighbouring lines (px)', 'Levels using it', '', 'When'], 34)
when = {'normal': 'Most levels.', 'fine': 'Every third level: smaller dots, lines closer together.',
        'bold': 'Tutorials and relax levels: bigger dots, fewer lines.'}
for i, s in enumerate(rules['styles']):
    r = s0 + 1 + i
    ps.cell(row=r, column=1, value=s['name']).font = BOLD
    ps.cell(row=r, column=2, value=s['dotRadius']).font = NORMAL
    ps.cell(row=r, column=3, value=s['pitch']).font = NORMAL
    ps.cell(row=r, column=4, value=f'=COUNTIF({lv}!$G${first}:$G${last},A{r})').font = NORMAL
    ps.cell(row=r, column=6, value=when.get(s['name'], '')).font = NORMAL
    for col in range(1, 7):
        ps.cell(row=r, column=col).border = BORDER
c0 = s0 + len(rules['styles']) + 3
ps.cell(row=c0 - 1, column=1, value='Colours').font = Font(name=FONT, bold=True, size=12)
ps.cell(row=c0, column=1, value=', '.join(rules['colours'])).font = NORMAL
ps.cell(row=c0 + 1, column=1, value='Lines that cross or touch get the most different colours; lines side by side never share one; '
                                    'all colours are used evenly (tools/silhouette/assemble.ts).').font = NORMAL
for col, w in zip('ABCDEF', [16, 62, 16, 12, 12, 34]):
    ps.column_dimensions[col].width = w

# ================================================================ Fit to silhouette
fs = wb.create_sheet('Fit to silhouette')
fs['A1'] = 'How well the lines fit the silhouette'
fs['A1'].font = Font(name=FONT, bold=True, size=14)
fs['A2'] = ('Rule: the lines fill the black of the picture exactly: every edge has a line along it and no line leaves the black. '
            'Measured by the builder on the finished level (lines as drawn in the game, 7 px wide for normal dots). '
            'Blue cells are the limits; a red cell is outside its limit.')
fs['A2'].alignment = WRAP
fs['A2'].font = NORMAL
fs.merge_cells('A2:K2')
fs.row_dimensions[2].height = 46
limits = [('Line outside the black (max share of line length)', 0.01, '0.0%'), ('Edge with a line flush against it (min)', 0.9, '0%'),
          ('Edge with a line close by, thin parts included (min)', 0.97, '0%'), ('Black area within reach of a line (min)', 0.97, '0%')]
for i, (name, v, fmt) in enumerate(limits):
    fs.cell(row=4 + i, column=1, value=name).font = NORMAL
    c = fs.cell(row=4 + i, column=5, value=v)
    c.font = BLUE
    c.fill = INPUT_FILL
    c.number_format = fmt
    c.border = BORDER
fs.cell(row=6, column=6, value='Thin parts (whiskers, wires, tubes too narrow for two lines with dots) get one centre line: '
                                'close to both edges but not flush.').font = GREY
F0 = 10
head(fs, F0, ['Level', 'Picture', 'Pattern', 'Line outside the black', 'Furthest outside (px)', 'Edge: line flush', 'Edge: line close by',
              'Area filled', 'Dots outside the black', 'Outline cuts hidden under dots', 'Tiny parts skipped', 'All inside limits?'], 58)
ff = F0 + 1
for i, r in enumerate(rows):
    x = ff + i
    f = r.get('fit') or {}
    parts = (r.get('built') or {}).get('parts') or {}
    vals = [r['level'], r.get('name', r['art']), r['pattern'], None if not f else f['overflowPct'] / 100, f.get('overflowMaxPx'),
            None if not f else f['edgeFlushPct'] / 100, None if not f else f['edgeNearPct'] / 100, None if not f else f['filledPct'] / 100,
            None if not f else f['dotsOutsidePct'] / 100, (parts.get('outlineCuts', 0) + parts.get('edgeSplits', 0)) if parts else None, parts.get('skipped')]
    for col, v in enumerate(vals, 1):
        c = fs.cell(row=x, column=col, value=v)
        c.font = NORMAL
        c.border = BORDER
    fs.cell(row=x, column=4).number_format = '0.0%'
    for col in (6, 7, 8, 9):
        fs.cell(row=x, column=col).number_format = '0%'
    fs.cell(row=x, column=12, value=f'=IF(D{x}="","not built",IF(AND(D{x}<=$E$4,G{x}>=$E$6,H{x}>=$E$7),IF(F{x}>=$E$5,"OK","OK (thin parts)"),"check"))').font = NORMAL
    fs.cell(row=x, column=12).border = BORDER
fl = ff + len(rows) - 1
fs.conditional_formatting.add(f'D{ff}:D{fl}', CellIsRule(operator='greaterThan', formula=['$E$4'], fill=BAD_FILL, font=BAD_FONT))
fs.conditional_formatting.add(f'G{ff}:G{fl}', CellIsRule(operator='lessThan', formula=['$E$6'], fill=BAD_FILL, font=BAD_FONT))
fs.conditional_formatting.add(f'H{ff}:H{fl}', CellIsRule(operator='lessThan', formula=['$E$7'], fill=BAD_FILL, font=BAD_FONT))
fs.conditional_formatting.add(f'L{ff}:L{fl}', CellIsRule(operator='equal', formula=['"check"'], fill=BAD_FILL, font=BAD_FONT))
fs.cell(row=F0 - 2, column=1, value='Summary').font = BOLD
fs.cell(row=F0 - 2, column=2, value=f'=COUNTIF(L{ff}:L{fl},"OK*")&" of "&COUNTA(A{ff}:A{fl})&" levels inside every limit; "&COUNTIF(L{ff}:L{fl},"check")&" to check"').font = NORMAL
for col, w in zip('ABCDEFGHIJKL', [8, 20, 15, 12, 12, 11, 11, 10, 11, 13, 11, 16]):
    fs.column_dimensions[col].width = w
fs.freeze_panes = fs.cell(row=ff, column=3)
fs.cell(row=F0, column=9).comment = Comment('Dots are bigger than the lines (radius 13-19 px against a 7 px line), so a dot on an outline always '
                                            'sticks out a little. Share of all dot area that lies outside the black.', 'Dot Line')
fs.cell(row=F0, column=10).comment = Comment('An outline with nothing joining it is one line; its two dots sit side by side on a short cut '
                                             'of the outline (hidden under them while playing).', 'Dot Line')

out = os.path.join(ROOT, 'design', 'silhouette-level-difficulty.xlsx')
wb.save(out)
print('Wrote', out, f'({len(rows)} levels)')
