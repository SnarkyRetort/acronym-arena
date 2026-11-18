"""v3.5.3 offline contract and dynamic-card migration smoke test."""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
import ast
from arena_core import Arena
from challenge_art import make_challenge_image

root=Path(__file__).resolve().parent
source=(root/'bot.py').read_text(encoding='utf-8')
ast.parse(source)
assert "VERSION = '3.5.3'" in source
assert "ART_NAME='acro_challenge.png'" in source
assert 'async def challenge_file(rid)' in source
assert 'group.add_item(discord.ui.MediaGallery(' in source
assert "('choice','Player’s Choice'" in source
assert 'await ensure_single_post(self.rid)' in source
assert 'class CardView(' not in source
assert 'msg=await chan.send(embed=card_embed(' not in source
assert 'for entry in arena.missing_cards()' not in source
assert 'await msg.delete()' in source
assert 'old.delete()' in source
assert 'def make_challenge_image(' in (root/'challenge_art.py').read_text(encoding='utf-8')
with TemporaryDirectory() as tmp:
    db=Arena(Path(tmp)/'test.sqlite3')
    rid=db.start(100,200,'Terrible restaurant specials',False,now=1830000000)
    with db.db() as con: con.execute('UPDATE ac33_rounds SET letters=? WHERE id=?',('UIQWT',rid))
    row=db.get(rid)
    assert rid==1
    assert not db.entries(rid)
    samples=[
        dict(user_id=11,answer='Uncooked Insect Quelled With Teeth'),
        dict(user_id=12,answer='Ultra Icky Quail With Tartar'),
        dict(user_id=13,answer='Uptown Iguana Quesadilla With Truffles'),
    ]
    names={11:'SnarkyRetort',12:'Simona',13:'CW'}
    for count in (0,3,25):
        entries=[dict(id=i+1,user_id=samples[i%3]['user_id'],answer=samples[i%3]['answer'],
                      firsts=i%3,seconds=i%2,comments=i%4,marks=i%2) for i in range(count)]
        png=make_challenge_image(row,entries,{'entries':count,'firsts':0,'seconds':0},names,root/'acro_arena_banner.jpg',version='3.5.3')
        im=Image.open(png)
        assert im.format=='PNG' and im.width==1200 and im.height>800
        assert len(png.getvalue())<8_000_000
        if count==3:(root/'preview.png').write_bytes(png.getvalue())
    # Existing database's monotonic IDs are the permanent challenge numbering.
    assert db.start(100,200,'More terrible restaurant specials',False,now=1830000010)==2
print('PASS: v3.5.3 single unified card, dynamic PNG 0/3/25 answers, sequential challenge IDs, version and legacy cleanup contract')