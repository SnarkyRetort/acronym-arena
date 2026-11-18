"""Offline 3.4 migration tests (no Discord token or network required)."""
import sqlite3
import tempfile
from pathlib import Path
from arena_core import Arena

def phrase(chars):return ' '.join(letter+'word' for letter in chars)
with tempfile.TemporaryDirectory() as tmp:
    path=Path(tmp)/'acronym_game.sqlite3'
    a=Arena(path)
    first=a.start(777,888,'Terrible spaceship names',False,now=1000)
    row=a.get(first)
    assert a.enter(first,111,phrase(row['letters']),now=1001)
    assert a.enter(first,222,phrase(row['letters']),now=1001)
    e=a.entries(first)[0]
    assert a.missing_cards()[0]['id']==e['id']
    a.record_card(e['id'],456789,888)
    a.set_thread(e['id'],555333)
    c=a.card(e['id'])
    assert c['message_id']==456789 and c['thread_id']==555333
    assert len(a.missing_cards())==1
    a.record_card(e['id'],456789,888)
    assert a.card(e['id'])['thread_id']==555333
    a.vote(first,222,1,e['id'],now=1010)
    stats=a.card_stats(e['id'])
    assert stats['score']==3 and stats['firsts']==1
    assert a.comment(first,e['id'],333,'Thread joke',now=1020)
    assert a.card_stats(e['id'])['comments']==1
    assert a.get(first)['state']=='open'
    a.finish(first,now=87400)
    # Comments remain available even after results, and on persistent cards.
    assert a.comment(first,e['id'],333,'Postgame joke',now=87500)
    assert a.card_stats(e['id'])['comments']==2
    b=Arena(path)
    assert b.card(e['id'])['thread_id']==555333
    assert b.card_stats(e['id'])['score']==3
    with b.db() as db:
        assert db.execute('SELECT COUNT(*) FROM ac34_cards').fetchone()[0]==1
    assert len(b.cards())==1
print('PASS: v3.4 card migration; card mapping; thread persistence; voting; comments after results; restart')