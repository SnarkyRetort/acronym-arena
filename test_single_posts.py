"""3.4 persistent single-post DB tests; offline, safe to rerun."""
from pathlib import Path
from tempfile import TemporaryDirectory
from arena_core import Arena

def phrase(letters):return ' '.join(c+'word' for c in letters)
with TemporaryDirectory() as tmp:
    path=Path(tmp)/'game.sqlite3'
    a=Arena(path)
    rid=a.start(222,333,'Terrible names for a spaceship',False,now=1000)
    assert a.single_post(rid) is None
    assert a.single_stats(rid)=={'entries':0,'firsts':0,'seconds':0}
    a.record_single_post(rid,333,10001)
    a.record_single_post(rid,333,10001)
    assert len(a.single_posts())==1
    assert a.single_post(rid)['message_id']==10001
    try:
        a.record_single_post(rid,999,1234)
        raise AssertionError('channel protection failed')
    except ValueError: pass
    a.enter(rid,101,phrase(a.get(rid)['letters']),now=1001)
    a.enter(rid,102,phrase(a.get(rid)['letters']),now=1001)
    assert a.single_stats(rid)['entries']==2
    e1=a.entries(rid)[0]['id']
    a.vote(rid,102,1,e1,now=1002)
    a.vote(rid,103,2,e1,now=1002)
    assert a.single_stats(rid)=={'entries':2,'firsts':1,'seconds':1}
    b=Arena(path)
    assert len(b.single_posts())==1
    assert b.single_post(rid)['message_id']==10001
    assert b.single_stats(rid)==a.single_stats(rid)
    b.record_single_post(rid,333,10002)
    assert len(b.single_posts())==1 and b.single_post(rid)['message_id']==10002
    b.finish(rid,now=87400)
    assert b.single_post(rid)['message_id']==10002
print('PASS: 3.4 persistent single-post migration, one-message mapping, votes, restart, result retention')