"""Acro Arena 3.5.3 offline regression checks for unified control flows."""
from pathlib import Path
from tempfile import TemporaryDirectory
import ast
from arena_core import Arena

ROOT = Path(__file__).resolve().parent
source = (ROOT / 'bot.py').read_text(encoding='utf-8')
tree = ast.parse(source)
assert "VERSION = '3.5.3'" in source
assert (ROOT / 'VERSION').read_text().strip() == '3.5.3'
assert 'class PrivateChallengeView' in source
assert 'class HostChallengeView' in source
assert 'class ConfirmDismissView' in source
assert "('open','Open Challenge'" in source
assert "('vote','Quick Vote'" in source
assert "('discussion','Discussion'" in source
assert "await i.response.send_message(personal_summary(self.rid,i.user.id)" in source
assert 'await msg.create_thread(' in source or 'await msg.create_thread(' in source.replace('thread=','')
assert 'arena.set_discussion(rid,thread.id)' in source
assert "@group.command(name='dismiss'" in source
assert "role.name.casefold()=='arena host'" in source
assert 'class CardView' not in source

with TemporaryDirectory() as tmp:
    path = Path(tmp) / 'existing.sqlite3'
    arena = Arena(path)
    now = 1_830_000_000
    first = arena.start(100, 200, 'Awful restaurant specials', False, now=now)
    with arena.db() as db:
        db.execute('UPDATE ac33_rounds SET letters=? WHERE id=?', ('BAD', first))
    assert arena.player_status(first, 11) == {'entered': False, 'first': False, 'second': False}
    assert arena.enter(first, 11, 'Big Angry Dinner', now=now+1)
    assert arena.enter(first, 12, 'Bad Apple Dessert', now=now+1)
    e1, e2 = arena.entries(first)
    arena.vote(first, 11, 1, e2['id'], now=now+2)
    arena.vote(first, 12, 2, e1['id'], now=now+2)
    assert arena.player_status(first, 11) == {'entered': True, 'first': True, 'second': False}
    assert arena.player_status(first, 12) == {'entered': True, 'first': False, 'second': True}
    arena.set_discussion(first, 98765)
    arena.set_discussion(first, 98766)
    assert arena.discussion(first) == 98766
    assert len(arena.active(200)) == 1
    with arena.db() as db:
        score_before = dict(db.execute('SELECT user_id,points FROM scores WHERE guild_id=100').fetchall())
        count_before = db.execute('SELECT COUNT(*) FROM ac33_entries WHERE round_id=?', (first,)).fetchone()[0]
    arena.dismiss(first)
    assert arena.get(first)['state'] == 'dismissed'
    assert not arena.active(200)
    assert arena.discussion(first) == 98766
    with arena.db() as db:
        assert db.execute('SELECT COUNT(*) FROM ac33_entries WHERE round_id=?', (first,)).fetchone()[0] == count_before
        assert dict(db.execute('SELECT user_id,points FROM scores WHERE guild_id=100').fetchall()) == score_before
        assert not db.execute("SELECT 1 FROM ac33_events WHERE round_id=? AND kind='winner'",(first,)).fetchone()
    try:
        arena.dismiss(first)
        raise AssertionError('Second dismissal accepted')
    except ValueError:
        pass
    second = arena.start(100, 200, 'Second challenge', False, now=now+3)
    assert second > first
    assert arena.get(second)['slot'] == arena.get(first)['slot']
    assert arena.discussion(second) is None
    # Database retains the same state after a process restart.
    restarted = Arena(path)
    assert restarted.get(first)['state'] == 'dismissed'
    assert restarted.discussion(first) == 98766
    assert len(restarted.active(200)) == 1
    assert restarted.player_status(first, 11)['entered']
print('PASS: v3.5.3 player status, vote state, one discussion mapping, host dismissal, preserved scores, restart')