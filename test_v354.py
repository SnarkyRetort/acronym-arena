"""v3.5.4 compact AI-mode labels: correct scope and route coverage."""
import ast
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from arena_core import Arena
from challenge_art import make_challenge_image

root=Path(__file__).resolve().parent
bot=(root/'bot.py').read_text(encoding='utf-8')
art=(root/'challenge_art.py').read_text(encoding='utf-8')
assert (root/'VERSION').read_text(encoding='utf-8').strip()=='3.5.4'
module=ast.parse(bot)
fn=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='ai_rule')
expr=next(n.value for n in fn.body if isinstance(n,ast.Return))
label=lambda on: eval(compile(ast.Expression(expr),'<ai_rule>','eval'),{'allowed':on})
assert label(True)=='🤖 AI OK'
assert label(False)=='🧠 AI FREE · HONOR SYSTEM'
assert 'def challenge_summary(' in bot and 'ai_rule(r["ai_allowed"])' in bot
assert 'def personal_summary(' in bot
assert 'toggle.label=ai_rule(self.ai_on)' in bot
assert 'label=ai_rule(self.ai_on)' in bot
assert 'self.phrase.label=f\'Expand {label(r)} · {ai_rule(r["ai_allowed"])}\'' in bot
assert "'AI OK' if row['ai_allowed'] else 'AI FREE  ·  HONOR SYSTEM'" in art
assert 'row=2' in bot
with TemporaryDirectory() as td:
    arena=Arena(Path(td)/'game.sqlite')
    t=1_830_000_000
    for allowed in (False,True):
        rid=arena.start(1,2,'Worst tourist attractions',allowed,now=t)
        row=arena.get(rid)
        png=make_challenge_image(row,[],arena.single_stats(rid),{},root/'acro_arena_banner.jpg',version='3.5.4')
        img=Image.open(png);img.verify()
        assert row['ai_allowed']==int(allowed)
print('PASS: v3.5.4 compact AI labels in both modes and all Discord UI paths')