"""Acro Arena 3.4 persistent game logic. Python stdlib only.
Existing 3.2 database is preserved: new tables have ac33_ prefix.
"""
import random
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

ROUND_SECONDS = 86400
CHOICE_SECONDS = 3600
MAX_SINGLES = 5
ENTRY_LIMIT = 25
MIN_PLAYERS = 2
THEMES = [
    'Things aliens find confusing', 'Worst possible superhero powers',
    'Reasons the captain abandoned ship', 'Unfortunate wedding vows',
    'Disastrous team-building exercises', 'Things you should never summon',
    'Worst excuses for being late', 'Terrible names for a spaceship',
    'Things a wizard should never say', 'Awful first-date conversation',
    'Worst things to hear at a funeral', 'Suspicious things in the refrigerator',
    'Questions nobody should ask a vampire', 'Bad advice from a time traveler',
    'Things a pirate regrets', 'Terrible ways to announce a promotion',
    'Things found in a haunted vending machine', 'Worst tourist attractions',
    'Failed alien invasion slogans', 'Things a robot should not Google',
    'Worst motivational posters', 'Unfortunate things to name a pet',
    'Things said at a doomed expedition briefing', 'Reasons to fire a wizard',
    "Excuses from the world's worst detective", 'Things you should never tell a dragon',
    'Worst names for a rock band', 'Things your spaceship AI should not say',
    'Awful products sold on late-night television', 'Terrible titles for romance novels',
    'Things a zombie is embarrassed about', 'Worst announcements on an airplane',
    "A horrible theme for a children's party", 'Things overheard in an evil lair',
    'Reasons the moon is suing Earth', 'Worst things to put on a resume',
    'Terrible restaurant specials', 'Reasons the haunted house got one star',
    'Things not to say at a job interview', 'Unfortunate government agency acronyms',
    'Worst advice from a survival expert', 'Things found in a supervillain break room',
    'Worst possible emergency broadcast', 'Excuses made by incompetent spies',
    'Things your grandmother never warned you about', 'Unfortunate space-station rules',
    'Worst things to hear from your surgeon', 'Reasons the cult cancelled its meeting',
    'Embarrassing intergalactic diplomatic incidents', 'Terrible things to name a planet',
]
VOWELS = 'AEIOU'
POOL = 'AAAAAAAABCDEEEEEEEEEEEEEFFGGHHHHIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSSSTTTTTTTUUUVWWXYYZ'


def letters(rng=None):
    rng = rng or random.SystemRandom()
    n = rng.randint(3, 6)
    val = [rng.choice(POOL) for _ in range(n)]
    if not set(val).intersection(VOWELS):
        val[rng.randrange(n)] = rng.choice(VOWELS)
    return ''.join(val)


def validate_answer(chars, phrase):
    words = phrase.strip().split()
    return len(words) == len(chars) and all(w[0].upper() == ch for w, ch in zip(words, chars))


class Arena:
    def __init__(self, path):
        self.path = Path(path)
        self.rng = random.SystemRandom()
        self.init_db()

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA busy_timeout=15000')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def init_db(self):
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS scores (
                    guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
                    points INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(guild_id,user_id));
                CREATE TABLE IF NOT EXISTS ac33_rounds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id INTEGER NOT NULL, channel_id INTEGER NOT NULL,
                    slot INTEGER NOT NULL, letters TEXT NOT NULL,
                    theme TEXT NOT NULL, ai_allowed INTEGER NOT NULL,
                    started INTEGER NOT NULL, deadline INTEGER,
                    state TEXT NOT NULL DEFAULT 'open', winner_id INTEGER,
                    choice_deadline INTEGER,
                    UNIQUE(channel_id,slot,started));
                CREATE INDEX IF NOT EXISTS ac33_channel ON ac33_rounds(channel_id,state);
                CREATE TABLE IF NOT EXISTS ac33_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    round_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
                    answer TEXT NOT NULL,
                    UNIQUE(round_id,user_id));
                CREATE TABLE IF NOT EXISTS ac33_votes (
                    round_id INTEGER NOT NULL, voter_id INTEGER NOT NULL,
                    rank INTEGER NOT NULL CHECK(rank IN (1,2)),
                    entry_id INTEGER NOT NULL,
                    PRIMARY KEY(round_id,voter_id,rank),
                    UNIQUE(round_id,voter_id,entry_id));
                CREATE TABLE IF NOT EXISTS ac33_marks (
                    round_id INTEGER NOT NULL, voter_id INTEGER NOT NULL,
                    entry_id INTEGER NOT NULL,
                    PRIMARY KEY(round_id,voter_id,entry_id));
                CREATE TABLE IF NOT EXISTS ac33_comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    round_id INTEGER NOT NULL, entry_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL, content TEXT NOT NULL,
                    created INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS ac33_events (
                    round_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
                    kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
                    points INTEGER NOT NULL,
                    PRIMARY KEY(round_id,user_id,kind,detail));
                CREATE TABLE IF NOT EXISTS ac34_cards (
                    entry_id INTEGER PRIMARY KEY,
                    round_id INTEGER NOT NULL,
                    channel_id INTEGER NOT NULL,
                    message_id INTEGER NOT NULL,
                    thread_id INTEGER);
                CREATE INDEX IF NOT EXISTS ac34_cards_thread ON ac34_cards(thread_id);
                CREATE TABLE IF NOT EXISTS ac34_single_posts (
                    round_id INTEGER PRIMARY KEY,
                    channel_id INTEGER NOT NULL,
                    message_id INTEGER NOT NULL);
                CREATE INDEX IF NOT EXISTS ac34_single_posts_channel ON ac34_single_posts(channel_id);
                CREATE TABLE IF NOT EXISTS ac351_discussions (
                    round_id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS ac33_choices (
                    round_id INTEGER PRIMARY KEY,
                    options TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS ac33_channels (
                    channel_id INTEGER PRIMARY KEY,guild_id INTEGER NOT NULL,
                    dashboard_id INTEGER);
                CREATE TABLE IF NOT EXISTS ac33_hosts (
                    guild_id INTEGER NOT NULL,user_id INTEGER NOT NULL,
                    PRIMARY KEY(guild_id,user_id));
            ''')

    def award(self, db, row, uid, kind, detail, amount):
        cur = db.execute('INSERT OR IGNORE INTO ac33_events VALUES(?,?,?,?,?)',
                         (row['id'], uid, kind, str(detail), amount))
        if cur.rowcount:
            db.execute('''INSERT INTO scores(guild_id,user_id,points) VALUES(?,?,?)
                ON CONFLICT(guild_id,user_id) DO UPDATE SET points=points+excluded.points''',
                (row['guild_id'],uid,amount))
        return bool(cur.rowcount)

    def active(self, channel):
        with self.db() as db:
            return db.execute("SELECT * FROM ac33_rounds WHERE channel_id=? AND state NOT IN ('done','dismissed') ORDER BY slot",(channel,)).fetchall()

    def get(self, rid):
        with self.db() as db:
            return db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()

    def choices(self, count=4):
        return self.rng.sample(THEMES, count)

    def start(self, guild, channel, theme, ai_allowed, now=None, slot=None):
        now = int(time.time() if now is None else now)
        theme = theme.strip()
        if not 3 <= len(theme) <= 100:
            raise ValueError('Theme must be 3–100 characters.')
        with self.db() as db:
            active = db.execute("SELECT slot FROM ac33_rounds WHERE channel_id=? AND state NOT IN ('done','dismissed')",(channel,)).fetchall()
            used = {r['slot'] for r in active}
            if slot is None:
                avail = set(range(1,MAX_SINGLES+1)) - used
                if not avail: raise ValueError('Five singles are already running.')
                slot = min(avail)
            elif slot in used or not 1 <= slot <= MAX_SINGLES:
                raise ValueError('That single slot is not available.')
            old_letters = {r['letters'] for r in db.execute("SELECT letters FROM ac33_rounds WHERE channel_id=? AND state NOT IN ('done','dismissed')",(channel,))}
            phrase = letters(self.rng)
            for _ in range(30):
                if phrase not in old_letters: break
                phrase = letters(self.rng)
            cur = db.execute('''INSERT INTO ac33_rounds(guild_id,channel_id,slot,letters,theme,ai_allowed,started,deadline)
               VALUES(?,?,?,?,?,?,?,?)''',(guild,channel,slot,phrase,theme,int(ai_allowed),now,now+ROUND_SECONDS))
            db.execute('INSERT OR IGNORE INTO ac33_channels(channel_id,guild_id) VALUES(?,?)',(channel,guild))
            return cur.lastrowid

    def single_post(self, round_id):
        with self.db() as db:
            return db.execute('SELECT * FROM ac34_single_posts WHERE round_id=?', (round_id,)).fetchone()

    def single_posts(self):
        with self.db() as db:
            return db.execute('SELECT * FROM ac34_single_posts').fetchall()

    def record_single_post(self, round_id, channel_id, message_id):
        with self.db() as db:
            row = db.execute('SELECT channel_id FROM ac33_rounds WHERE id=?', (round_id,)).fetchone()
            if not row or row['channel_id'] != channel_id:
                raise ValueError('Single is not in this channel.')
            db.execute('''INSERT INTO ac34_single_posts(round_id,channel_id,message_id)
                VALUES(?,?,?) ON CONFLICT(round_id) DO UPDATE SET
                channel_id=excluded.channel_id,message_id=excluded.message_id''',
                (round_id,channel_id,message_id))

    def discussion(self, round_id):
        with self.db() as db:
            row=db.execute('SELECT thread_id FROM ac351_discussions WHERE round_id=?',(round_id,)).fetchone()
            return row['thread_id'] if row else None

    def set_discussion(self, round_id, thread_id):
        with self.db() as db:
            db.execute('INSERT INTO ac351_discussions(round_id,thread_id) VALUES(?,?) '
                       'ON CONFLICT(round_id) DO UPDATE SET thread_id=excluded.thread_id',
                       (round_id,thread_id))

    def dismiss(self, rid):
        """Cancel an open challenge without selecting a winner or resetting scores."""
        with self.db() as db:
            row=db.execute('SELECT state FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            if not row or row['state']!='open':
                raise ValueError('Only an open challenge can be dismissed.')
            db.execute("UPDATE ac33_rounds SET state='dismissed',deadline=NULL,choice_deadline=NULL WHERE id=?",(rid,))

    def player_status(self, rid, uid):
        with self.db() as db:
            entry=db.execute('SELECT id FROM ac33_entries WHERE round_id=? AND user_id=?',(rid,uid)).fetchone()
            votes=db.execute('SELECT rank FROM ac33_votes WHERE round_id=? AND voter_id=?',(rid,uid)).fetchall()
            return {'entered':bool(entry),'first':any(v['rank']==1 for v in votes),
                    'second':any(v['rank']==2 for v in votes)}

    def single_stats(self, round_id):
        with self.db() as db:
            entries = db.execute('SELECT COUNT(*) FROM ac33_entries WHERE round_id=?', (round_id,)).fetchone()[0]
            firsts = db.execute('SELECT COUNT(*) FROM ac33_votes WHERE round_id=? AND rank=1', (round_id,)).fetchone()[0]
            seconds = db.execute('SELECT COUNT(*) FROM ac33_votes WHERE round_id=? AND rank=2', (round_id,)).fetchone()[0]
            return {'entries': entries, 'firsts': firsts, 'seconds': seconds}

    def entries(self, rid):
        with self.db() as db:
            return db.execute('SELECT * FROM ac33_entries WHERE round_id=? ORDER BY id',(rid,)).fetchall()

    def enter(self, rid, uid, answer, now=None):
        now = int(time.time() if now is None else now)
        with self.db() as db:
            row = db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            if not row or row['state']!='open' or row['deadline'] <= now:
                raise ValueError('Entries are closed.')
            answer = ' '.join(answer.split())
            if not validate_answer(row['letters'],answer):
                raise ValueError('Use exactly one word for each letter, in order.')
            existing = db.execute('SELECT id FROM ac33_entries WHERE round_id=? AND user_id=?',(rid,uid)).fetchone()
            if not existing and db.execute('SELECT COUNT(*) FROM ac33_entries WHERE round_id=?',(rid,)).fetchone()[0] >= ENTRY_LIMIT:
                raise ValueError('This single is full (25 entries).')
            db.execute('''INSERT INTO ac33_entries(round_id,user_id,answer) VALUES(?,?,?)
                ON CONFLICT(round_id,user_id) DO UPDATE SET answer=excluded.answer''',(rid,uid,answer))
            return self.award(db,row,uid,'entry','',1)

    def entry(self, entry_id):
        with self.db() as db:
            return db.execute('SELECT * FROM ac33_entries WHERE id=?',(entry_id,)).fetchone()

    def card(self, entry_id):
        with self.db() as db:
            return db.execute('SELECT * FROM ac34_cards WHERE entry_id=?',(entry_id,)).fetchone()

    def cards(self):
        with self.db() as db:
            return db.execute('SELECT * FROM ac34_cards').fetchall()

    def missing_cards(self):
        with self.db() as db:
            return db.execute('''SELECT e.id FROM ac33_entries e
                JOIN ac33_rounds r ON r.id=e.round_id
                LEFT JOIN ac34_cards c ON c.entry_id=e.id
                WHERE c.entry_id IS NULL AND r.state IN ('open','choice')
                ORDER BY e.id''').fetchall()

    def record_card(self, entry_id, message_id, channel_id, thread_id=None):
        with self.db() as db:
            entry=db.execute('''SELECT e.round_id,r.channel_id FROM ac33_entries e
              JOIN ac33_rounds r ON r.id=e.round_id WHERE e.id=?''',(entry_id,)).fetchone()
            if not entry or entry['channel_id']!=channel_id:
                raise ValueError('Entry does not belong to this channel.')
            db.execute('''INSERT INTO ac34_cards(entry_id,round_id,channel_id,message_id,thread_id)
                 VALUES(?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET
                 message_id=excluded.message_id,
                 thread_id=COALESCE(excluded.thread_id,ac34_cards.thread_id)''',
                 (entry_id,entry['round_id'],channel_id,message_id,thread_id))

    def set_thread(self, entry_id, thread_id):
        with self.db() as db:
            db.execute('UPDATE ac34_cards SET thread_id=? WHERE entry_id=?',(thread_id,entry_id))

    def card_stats(self, entry_id):
        with self.db() as db:
            e=db.execute('SELECT * FROM ac33_entries WHERE id=?',(entry_id,)).fetchone()
            if not e:return None
            votes=db.execute('''SELECT COALESCE(SUM(CASE rank WHEN 1 THEN 3 ELSE 1 END),0) score,
                SUM(CASE WHEN rank=1 THEN 1 ELSE 0 END) firsts,
                SUM(CASE WHEN rank=2 THEN 1 ELSE 0 END) seconds
                FROM ac33_votes WHERE entry_id=?''',(entry_id,)).fetchone()
            comments=db.execute('SELECT COUNT(*) FROM ac33_comments WHERE entry_id=?',(entry_id,)).fetchone()[0]
            marks=db.execute('SELECT COUNT(*) FROM ac33_marks WHERE entry_id=?',(entry_id,)).fetchone()[0]
            return {'entry':e,'score':votes['score'],'firsts':votes['firsts'] or 0,
                    'seconds':votes['seconds'] or 0,'comments':comments,'marks':marks}

    def vote(self, rid, uid, rank, entry_id, now=None):
        now = int(time.time() if now is None else now)
        if rank not in (1,2): raise ValueError('Choose first or second place.')
        with self.db() as db:
            row = db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            if not row or row['state']!='open' or row['deadline']<=now: raise ValueError('Voting is closed.')
            if db.execute('SELECT COUNT(*) FROM ac33_entries WHERE round_id=?',(rid,)).fetchone()[0] < MIN_PLAYERS:
                raise ValueError('Voting needs at least two different entries.')
            candidate = db.execute('SELECT user_id FROM ac33_entries WHERE id=? AND round_id=?',(entry_id,rid)).fetchone()
            if not candidate: raise ValueError('Answer not found.')
            if candidate['user_id']==uid: raise ValueError('You cannot vote for yourself.')
            clash = db.execute('SELECT 1 FROM ac33_votes WHERE round_id=? AND voter_id=? AND entry_id=? AND rank!=?',
                               (rid,uid,entry_id,rank)).fetchone()
            if clash: raise ValueError('You already picked this answer for the other rank.')
            db.execute('DELETE FROM ac33_votes WHERE round_id=? AND voter_id=? AND rank=?',(rid,uid,rank))
            db.execute('INSERT INTO ac33_votes(round_id,voter_id,rank,entry_id) VALUES(?,?,?,?)',
                       (rid,uid,rank,entry_id))

    def marks(self, rid, uid, eid, now=None):
        now = int(time.time() if now is None else now)
        with self.db() as db:
            row=db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            entry=db.execute('SELECT user_id FROM ac33_entries WHERE id=? AND round_id=?',(eid,rid)).fetchone()
            if not row or row['state']!='open' or row['deadline']<=now or not entry or entry['user_id']==uid:
                raise ValueError('Endorsement unavailable.')
            found=db.execute('SELECT 1 FROM ac33_marks WHERE round_id=? AND voter_id=? AND entry_id=?',(rid,uid,eid)).fetchone()
            if found:
                db.execute('DELETE FROM ac33_marks WHERE round_id=? AND voter_id=? AND entry_id=?',(rid,uid,eid))
            else:
                db.execute('INSERT INTO ac33_marks VALUES(?,?,?)',(rid,uid,eid))
            return not bool(found)

    def comment(self, rid, eid, uid, content, now=None):
        now = int(time.time() if now is None else now)
        content=content.strip()
        if not 2<=len(content)<=250: raise ValueError('Comment must be 2–250 characters.')
        with self.db() as db:
            row=db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            entry=db.execute('SELECT 1 FROM ac33_entries WHERE round_id=? AND id=?',(rid,eid)).fetchone()
            if not row or not entry: raise ValueError('Answer no longer available.')
            db.execute('INSERT INTO ac33_comments(round_id,entry_id,user_id,content,created) VALUES(?,?,?,?,?)',
                       (rid,eid,uid,content,now))
            # One point per distinct reply, maximum 3 per user per single.
            replies=db.execute('SELECT COUNT(*) FROM ac33_events WHERE round_id=? AND user_id=? AND kind=?',(rid,uid,'reply')).fetchone()[0]
            return self.award(db,row,uid,'reply',str(replies+1),1) if replies < 3 else False

    def finish(self, rid, now=None):
        now=int(time.time() if now is None else now)
        with self.db() as db:
            row=db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            if not row or row['state']!='open': return None
            results=db.execute('''SELECT e.id,e.user_id,e.answer,
                COALESCE(SUM(CASE WHEN v.rank=1 THEN 3 WHEN v.rank=2 THEN 1 ELSE 0 END),0) AS votes
                FROM ac33_entries e LEFT JOIN ac33_votes v ON e.id=v.entry_id
                WHERE e.round_id=? GROUP BY e.id ORDER BY votes DESC,e.id''',(rid,)).fetchall()
            highest=results[0]['votes'] if results else 0
            ties=[x for x in results if x['votes']==highest] if highest else []
            winner=ties[0]['user_id'] if len(ties)==1 else None
            for e in results:
                if db.execute('SELECT 1 FROM ac33_marks WHERE round_id=? AND entry_id=? LIMIT 1',(rid,e['id'])).fetchone():
                    self.award(db,row,e['user_id'],'on_theme','',5)
            if winner is not None:
                self.award(db,row,winner,'winner','',25)
                opts=self.choices(4)
                db.execute('INSERT OR REPLACE INTO ac33_choices(round_id,options) VALUES(?,?)',(rid,'\n'.join(opts)))
                db.execute("UPDATE ac33_rounds SET state='choice',winner_id=?,choice_deadline=?,deadline=NULL WHERE id=?",
                           (winner,now+CHOICE_SECONDS,rid))
            else:
                db.execute("UPDATE ac33_rounds SET state='done',deadline=NULL WHERE id=?",(rid,))
            return {'winner':winner,'scores':[(e['user_id'],e['answer'],e['votes']) for e in results],
                    'slot':row['slot'],'channel':row['channel_id'],'guild':row['guild_id'],'id':rid}

    def champion_options(self, rid):
        with self.db() as db:
            row=db.execute('SELECT options FROM ac33_choices WHERE round_id=?',(rid,)).fetchone()
            return row['options'].split('\n') if row else []

    def champion(self,rid,uid,theme=None,ai_allowed=None,now=None,automatic=False):
        now=int(time.time() if now is None else now)
        with self.db() as db:
            row=db.execute('SELECT * FROM ac33_rounds WHERE id=?',(rid,)).fetchone()
            if not row or row['state']!='choice':raise ValueError('Champion choice has expired.')
            if not automatic and row['winner_id']!=uid:raise ValueError('Only the champion can choose.')
            options=self.champion_options(rid)
            if not automatic and theme is not None and theme not in options and not 3<=len(theme.strip())<=100:
                raise ValueError('Custom theme must be 3–100 characters.')
            selected=theme.strip() if theme else self.rng.choice(options)
            flag=bool(row['ai_allowed']) if ai_allowed is None else bool(ai_allowed)
            db.execute("UPDATE ac33_rounds SET state='done',choice_deadline=NULL WHERE id=?",(rid,))
            guild,channel,slot=row['guild_id'],row['channel_id'],row['slot']
        new_id=self.start(guild,channel,selected,flag,now,slot)
        return new_id,selected

    def due(self,now=None):
        now=int(time.time() if now is None else now)
        with self.db() as db:
            return [(r['id'],r['state']) for r in db.execute('''SELECT id,state FROM ac33_rounds
                WHERE (state='open' AND deadline<=?) OR (state='choice' AND choice_deadline<=?)''',(now,now))]

    def leaders(self,guild):
        with self.db() as db:
            return db.execute('SELECT user_id,points FROM scores WHERE guild_id=? ORDER BY points DESC LIMIT 10',(guild,)).fetchall()