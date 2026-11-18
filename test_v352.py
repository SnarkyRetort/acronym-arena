"""3.5.2 release regressions for AI honor rules, winner choice and archive wiring."""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from arena_core import Arena
from challenge_art import make_challenge_image

root=Path(__file__).resolve().parent
source=(root/'bot.py').read_text(encoding='utf-8')
assert "VERSION = '3.5.2'" in source
assert (root/'VERSION').read_text().strip()=='3.5.2'
assert 'class ThemeView' in source
assert "self.ai_on=not self.ai_on" in source
assert "child.ai_on=self.ai_on" in source
assert "await i.response.edit_message" in source
assert 'ThemeCustom(self.caller,self.choice_round,self.ai_on)' in source
assert 'arena.rng.choice(self.theme_options),self.choice_round,self.ai_on' in source
assert 'async def archive_challenge_discussions' in source
assert 'await archive_challenge_discussions(rid)' in source
assert 'await archive_legacy_answer_threads()' in source
assert "thread.edit(archived=True" in source
assert 'if primary and not legacy:ids.add(primary)' in source
assert 'SELECT thread_id FROM ac34_cards' in source
assert 'HONOR SYSTEM' in source
art=(root/'challenge_art.py').read_text(encoding='utf-8')
assert 'HONOR SYSTEM' in art
with TemporaryDirectory() as td:
    arena=Arena(Path(td)/'game.sqlite')
    t=1_830_000_000
    rid=arena.start(1,2,'Restaurant specials',False,now=t)
    assert not arena.get(rid)['ai_allowed']
    with arena.db() as db:db.execute('UPDATE ac33_rounds SET letters=? WHERE id=?',('BAD',rid))
    arena.enter(rid,101,'Big Angry Dinner',now=t+1)
    arena.enter(rid,102,'Bad Apple Dessert',now=t+1)
    other=arena.entries(rid)[1]
    arena.vote(rid,101,1,other['id'],now=t+2)
    outcome=arena.finish(rid,now=t+3)
    assert outcome['winner']==102
    nxt,theme=arena.champion(rid,102,theme='Terrible restaurant specials',ai_allowed=True,now=t+4)
    assert arena.get(nxt)['ai_allowed']==1
    assert arena.get(rid)['state']=='done'
    row=arena.get(nxt)
    pic=make_challenge_image(row,[],arena.single_stats(nxt),{},root/'acro_arena_banner.jpg',version='3.5.2')
    assert Image.open(pic).verify() is None
    assert Arena(arena.path).get(nxt)['ai_allowed']==1
print('PASS: v3.5.2 AI ON/OFF choice, honor labels, discussion archiving contract, and persisted next challenge')