"""Offline regression: no Discord access or credentials required."""
import ast, asyncio, json, random, sqlite3, tempfile, time, types
from pathlib import Path
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from themes import THEMES
source=Path(__file__).with_name('bot.py').read_text()
tree=ast.parse(source)
names={'connect','init_db','award_points','generate_letters','check_words','week_start','rows_for','slot_row',
       'entry_count','vote_count','difficulty_for','theme_options','replacement','vote_eligible','pass_count','ensure_boards',
       'progress_text','finish_board','finalize_champion','notify_participants','board_status','dashboard_embed'}
nodes=[x for x in tree.body if isinstance(x,(ast.FunctionDef,ast.AsyncFunctionDef)) and x.name in names]
code=compile(ast.Module(body=nodes,type_ignores=[]),'bot.py','exec')
@contextmanager
def lock(_):yield
class FakeLock:
 async def __aenter__(self):pass
 async def __aexit__(self,*a):pass
class FakeDiscord:
 class utils:
  @staticmethod
  def escape_markdown(s):return s
messages=[]; scheduled=[]
async def announce(c,m):messages.append(m)
async def refresh(c):pass
async def notify(*args,**kwargs):pass
def schedule(r):scheduled.append(r)
async def scenario(legacy):
 with tempfile.TemporaryDirectory() as folder:
  path=Path(folder)/'scores.sqlite3'
  if legacy:
   with sqlite3.connect(path) as db:
    db.executescript('''
    CREATE TABLE scores(guild_id INTEGER,user_id INTEGER,points INTEGER,PRIMARY KEY(guild_id,user_id));
    INSERT INTO scores VALUES(100,200,37);
    CREATE TABLE rounds(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id INTEGER,channel_id INTEGER,letters TEXT,phase TEXT,prompt_id INTEGER,status_id INTEGER);
    INSERT INTO rounds VALUES(1,100,900,'BATS','finished',NULL,NULL);
    CREATE TABLE entries(id INTEGER PRIMARY KEY AUTOINCREMENT,round_id INTEGER,user_id INTEGER,answer TEXT,UNIQUE(round_id,user_id));
    CREATE TABLE votes(round_id INTEGER,voter_id INTEGER,entry_id INTEGER,PRIMARY KEY(round_id,voter_id));
    CREATE TABLE completed_results(round_id INTEGER PRIMARY KEY,guild_id INTEGER,finished_at INTEGER,winner_id INTEGER,winning_votes INTEGER,tie INTEGER);
    INSERT INTO completed_results VALUES(1,100,1700000000,200,2,0);
    ''')
  g=dict(sqlite3=sqlite3,contextmanager=contextmanager,DB=path,rng=random.SystemRandom(),LETTERS='AAAAABCDEEEEEFFFFFGGHHIIIIJKLLMMNNOOOPPRRSSSTTTTUUUVXYZ',
      SLOTS=5,THEMED_SLOTS=(1,2),ENTRY_SECONDS=86400,CHOICE_SECONDS=3600,MIN_PLAYERS=2,
      time=time,datetime=datetime,timezone=timezone,timedelta=timedelta,THEMES=THEMES,Path=Path,json=json,
      channel_lock=lambda c:FakeLock(),discord=FakeDiscord,announce=announce,refresh_dashboard=refresh,notify_opted=notify,schedule=schedule)
  exec(code,g)
  g['init_db']();g['init_db']()
  with g['connect']() as db:
   assert db.execute('SELECT COUNT(*) FROM theme_bank').fetchone()[0]==100
   g['ensure_boards'](db,900,100)
   rows=g['rows_for'](db,900)
   assert len(rows)==5
   assert all(r['theme'] for r in rows[:2])
   assert all(not r['theme'] for r in rows[2:])
   old_score=db.execute('SELECT points FROM scores WHERE guild_id=100 AND user_id=200').fetchone()
   assert (old_score['points'] if old_score else 0)==(37 if legacy else 0)
   r=rows[0];rid=r['id']
   assert not g['vote_eligible'](db,r)
   for user in (200,201):
    answer=' '.join(c+'word' for c in r['letters'])
    db.execute('INSERT INTO entries(round_id,user_id,answer) VALUES(?,?,?)',(rid,user,answer))
    assert g['award_points'](db,rid,100,user,'entry',1)
    assert not g['award_points'](db,rid,100,user,'entry',1)
   r=g['slot_row'](db,900,1)
   assert g['vote_eligible'](db,r)
   e=db.execute('SELECT id FROM entries WHERE round_id=? AND user_id=200',(rid,)).fetchone()
   db.execute('INSERT INTO votes(round_id,voter_id,entry_id) VALUES(?,?,?)',(rid,202,e['id']))
   db.execute('INSERT INTO vote_passes(round_id,voter_id) VALUES(?,?)',(rid,201))
   db.execute('INSERT INTO theme_marks(round_id,entry_id,voter_id) VALUES(?,?,?)',(rid,e['id'],201))
   assert 'Passed' in g['progress_text'](db,900,201)
  assert await g['finish_board'](900,1,rid)
  assert not await g['finish_board'](900,1,rid)
  with g['connect']() as db:
   row=g['slot_row'](db,900,1)
   assert row['phase']=='choice'
   choice=db.execute('SELECT * FROM champion_choices WHERE round_id=?',(rid,)).fetchone()
   assert len(json.loads(choice['options_json']))==3
   score=db.execute('SELECT points FROM scores WHERE guild_id=100 AND user_id=200').fetchone()['points']
   assert score==(68 if legacy else 31), score
   assert db.execute("SELECT COUNT(*) FROM point_events WHERE round_id=? AND kind='on_theme'",(rid,)).fetchone()[0]==1
   target=json.loads(choice['options_json'])[1]
  assert await g['finalize_champion'](900,1,rid,target)
  assert not await g['finalize_champion'](900,1,rid,target)
  with g['connect']() as db:
   row=g['slot_row'](db,900,1)
   assert row['phase']=='submitting' and row['theme']==target and row['deadline']>=time.time()+86390
   r2=g['slot_row'](db,900,3)
   for user in (200,201):
    db.execute('INSERT INTO entries(round_id,user_id,answer) VALUES(?,?,?)',
      (r2['id'],user,' '.join(c+'word' for c in r2['letters'])))
    g['award_points'](db,r2['id'],100,user,'entry',1)
   db.execute('INSERT INTO vote_passes(round_id,voter_id) VALUES(?,?)',(r2['id'],202))
  assert await g['finish_board'](900,3,r2['id'])
  with g['connect']() as db:
   assert g['slot_row'](db,900,3)['phase']=='submitting'
   assert g['slot_row'](db,900,3)['theme'] is None
  print('PASS', 'legacy migration' if legacy else 'fresh installation')
asyncio.run(scenario(False));asyncio.run(scenario(True))
