"""Run with py test_v33.py. No Discord connection or token required."""
import sqlite3
from contextlib import closing
import tempfile
from pathlib import Path
from arena_core import Arena, validate_answer, letters, MAX_SINGLES


def assert_error(fn, contains=None):
    try: fn()
    except ValueError as e:
        if contains:assert contains.lower() in str(e).lower(), (contains,str(e))
    else:raise AssertionError('Expected ValueError')


def phrase(chars):
    return ' '.join(ch+'word' for ch in chars)

with tempfile.TemporaryDirectory() as folder:
    filename=Path(folder)/'acronym_game.sqlite3'
    with closing(sqlite3.connect(filename)) as db:
        db.executescript('''
            CREATE TABLE scores (guild_id INTEGER,user_id INTEGER,points INTEGER,
                    PRIMARY KEY(guild_id,user_id));
            INSERT INTO scores VALUES(100,201,37);
            CREATE TABLE rounds (id INTEGER PRIMARY KEY,letters TEXT);
            INSERT INTO rounds VALUES(1,'BATS');
            CREATE TABLE arena_board_slots(channel_id INTEGER,slot INTEGER,round_id INTEGER);
            INSERT INTO arena_board_slots VALUES(900,1,1);
        ''')
    g=Arena(filename)
    g.init_db()  # repeat init must preserve everything
    with g.db() as db:
        assert db.execute('SELECT points FROM scores WHERE user_id=201').fetchone()[0]==37
        assert db.execute('SELECT COUNT(*) FROM arena_board_slots').fetchone()[0]==1
    assert all(len(letters()) in range(3,7) for _ in range(200))
    first=g.start(100,900,'Reasons the captain abandoned ship',False,now=1000)
    r=g.get(first)
    assert r['slot']==1 and r['deadline']==87400 and r['ai_allowed']==0
    assert not validate_answer(r['letters'],'Wrong words here') or len(r['letters'])==3
    assert_error(lambda:g.enter(first,201,'Wrong sentence',now=1010),'one word')
    a=phrase(r['letters'])
    assert g.enter(first,201,a,now=1010)
    assert not g.enter(first,201,a,now=1020)  # edit no double points
    assert_error(lambda:g.vote(first,300,1,g.entries(first)[0]['id'],now=1030),'two')
    assert g.enter(first,202,a,now=1010)
    es=g.entries(first)
    e1,e2=es[0]['id'],es[1]['id']
    assert_error(lambda:g.vote(first,201,1,e1,now=1020),'yourself')
    g.vote(first,201,1,e2,now=1020)
    g.vote(first,202,1,e1,now=1020)
    g.vote(first,300,1,e1,now=1020)
    assert_error(lambda:g.vote(first,300,2,e1,now=1020),'other rank')
    g.vote(first,300,2,e2,now=1020)
    g.vote(first,300,2,e2,now=1020)  # change same rank is safe
    assert g.marks(first,202,e1,now=1020)
    assert not g.marks(first,202,e1,now=1020)
    assert g.marks(first,202,e1,now=1020)
    for x in range(5):
        assert g.comment(first,e1,300,f'Funny comment number {x}',now=1020)==(x<3)
    assert_error(lambda:g.enter(first,301,a,now=87401),'closed')
    result=g.finish(first,now=87400)
    assert result['winner']==201, result
    assert not g.finish(first,now=87400)  # idempotent
    assert g.get(first)['state']=='choice'
    assert len(g.champion_options(first))==4
    with g.db() as db:
        pts={x['user_id']:x['points'] for x in db.execute('SELECT user_id,points FROM scores')}
    assert pts[201]==37+1+5+25,pts  # on-theme, entry, win
    assert pts[300]==3
    assert_error(lambda:g.champion(first,202,'A custom theme',now=87500),'champion')
    follow,theme=g.champion(first,201,'My custom space joke',False,now=87501)
    assert theme=='My custom space joke'
    assert g.get(follow)['slot']==1
    assert g.get(first)['state']=='done'
    # Four extra slots, five at once total. 6th must fail.
    for x in range(4):g.start(100,900,f'Extra silly theme {x}',True,now=88000+x)
    assert len(g.active(900))==5
    assert_error(lambda:g.start(100,900,'Too many',False,now=88010),'five')
    # Restart from disk preserves records and old board slots.
    h=Arena(filename)
    assert len(h.active(900))==5
    assert h.get(follow)['state']=='open'
    # A no-vote round ties with no winner, its slot frees up.
    done=h.finish(follow,now=90000)
    assert done['winner'] is None and h.get(follow)['state']=='done'
    assert len(h.active(900))==4
    # Timer detection and automatic fallback.
    pending=h.active(900)[0]
    for uid in [401,402]:h.enter(pending['id'],uid,phrase(pending['letters']),now=pending['started']+1)
    h.vote(pending['id'],401,1,h.entries(pending['id'])[1]['id'],now=pending['started']+2)
    assert (pending['id'],'open') in h.due(pending['deadline'])
    won=h.finish(pending['id'],now=pending['deadline'])
    assert won['winner']==402
    assert (pending['id'],'choice') in h.due(pending['deadline']+3600)
    new,selected=h.champion(pending['id'],0,automatic=True,now=pending['deadline']+3600)
    assert selected in h.choices(50) and h.get(new)['slot']==pending['slot']
print('PASS: migration; idempotence; entry; ranked voting; self-vote; changes; bonus; comments; caps; winner; choices; 5 slots; timers; restart')