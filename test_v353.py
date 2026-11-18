"""v3.5.4 release regression: theme controls fit Discord action-row widths."""
import ast
from pathlib import Path

root=Path(__file__).resolve().parent
source=(root/'bot.py').read_text(encoding='utf-8')
assert "VERSION = '3.5.4'" in source
assert (root/'VERSION').read_text(encoding='utf-8').strip()=='3.5.4'
module=ast.parse(source)
view=next(n for n in module.body if isinstance(n,ast.ClassDef) and n.name=='ThemeView')
init=next(n for n in view.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name=='__init__')
assign=next(n for n in ast.walk(init) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='toggle' for t in n.targets))
assert isinstance(assign.value,ast.Call)
row=next(kw.value.value for kw in assign.value.keywords if kw.arg=='row')
assert row==2, f'AI toggle must occupy row 2, not the theme-actions row: {row}'
# ThemeSelect, whose 5-unit width fills row 0, stays on its default row.
# Decorated Other and Auto buttons (2 units each) occupy row 1.
# The AI toggle (2 units) must therefore be in row 2.
buttons=[n for n in view.body if isinstance(n,ast.AsyncFunctionDef) and n.name in {'custom','auto'}]
assert len(buttons)==2
assert all(any(isinstance(d,ast.Call) and isinstance(d.func,ast.Attribute) and d.func.attr=='button' for d in n.decorator_list) for n in buttons)
assert 'self.add_item(ThemeSelect(' in source
assert 'self.add_item(toggle)' in source
print('PASS: v3.5.4 theme menu fits select + two actions + AI toggle across three rows')