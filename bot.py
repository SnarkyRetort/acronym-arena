"""Acro Arena 3.2 — five independent persistent daily boards with themes.
Run on Windows with: py bot.py
"""
import asyncio
import json
from contextlib import contextmanager
import os
import random
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
TOKEN = os.getenv('DISCORD_TOKEN', '').strip()
GUILD_ID = os.getenv('GUILD_ID', '').strip()
OWNER_ID = int(os.getenv('ARENA_OWNER_ID', '1102646403534172231'))
DB = ROOT / 'acronym_game.sqlite3'
ENTRY_SECONDS = 24 * 60 * 60
CHOICE_SECONDS = 3600
MIN_PLAYERS = 2
MAX_ENTRIES = 25  # Discord string select option limit
SLOTS = 5
THEMED_SLOTS = (1, 2)
rng = random.SystemRandom()
# English-inspired frequencies, not equal-weight alphabet soup.
LETTERS = 'AAAAAAAABCDEEEEEEEEEEEEEFFGGHHHHIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSSSTTTTTTTUUUVWWXYYZ'
locks = {}
timers = {}


def channel_lock(channel_id):
    return locks.setdefault(channel_id, asyncio.Lock())


@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    try:
        with db:
            yield db
    finally:
        db.close()


def init_db():
    """Add only new tables/columns; never drop historical player records."""
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id INTEGER NOT NULL, channel_id INTEGER NOT NULL,
            letters TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'submitting',
            prompt_id INTEGER, status_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER NOT NULL REFERENCES rounds(id),
            user_id INTEGER NOT NULL, answer TEXT NOT NULL,
            UNIQUE(round_id,user_id)
        );
        CREATE TABLE IF NOT EXISTS votes (
            round_id INTEGER NOT NULL REFERENCES rounds(id),
            voter_id INTEGER NOT NULL,
            entry_id INTEGER NOT NULL REFERENCES entries(id),
            PRIMARY KEY(round_id,voter_id)
        );
        CREATE TABLE IF NOT EXISTS scores (
            guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
            points INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(guild_id,user_id)
        );
        CREATE TABLE IF NOT EXISTS point_events (
            round_id INTEGER NOT NULL REFERENCES rounds(id),
            guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
            kind TEXT NOT NULL, points INTEGER NOT NULL, awarded_at INTEGER NOT NULL,
            PRIMARY KEY(round_id,user_id,kind)
        );
        CREATE INDEX IF NOT EXISTS point_events_week ON point_events(guild_id,awarded_at);
        CREATE TABLE IF NOT EXISTS arena_hosts (
            guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
            PRIMARY KEY(guild_id,user_id)
        );
        CREATE TABLE IF NOT EXISTS completed_results (
            round_id INTEGER PRIMARY KEY REFERENCES rounds(id),
            guild_id INTEGER NOT NULL, finished_at INTEGER NOT NULL,
            winner_id INTEGER, winning_votes INTEGER NOT NULL DEFAULT 0,
            tie INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS results_guild_date ON completed_results(guild_id,finished_at);
        CREATE TABLE IF NOT EXISTS arena_dashboards (
            channel_id INTEGER PRIMARY KEY, guild_id INTEGER NOT NULL,
            message_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS arena_board_slots (
            channel_id INTEGER NOT NULL, slot INTEGER NOT NULL,
            round_id INTEGER NOT NULL REFERENCES rounds(id),
            PRIMARY KEY(channel_id,slot), UNIQUE(round_id)
        );
        ''')
        db.executescript("""
        CREATE TABLE IF NOT EXISTS vote_passes (
            round_id INTEGER NOT NULL, voter_id INTEGER NOT NULL,
            PRIMARY KEY(round_id,voter_id)
        );
        CREATE TABLE IF NOT EXISTS theme_marks (
            round_id INTEGER NOT NULL, entry_id INTEGER NOT NULL,
            voter_id INTEGER NOT NULL,
            PRIMARY KEY(round_id,entry_id,voter_id)
        );
        CREATE TABLE IF NOT EXISTS theme_bank (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            category TEXT NOT NULL DEFAULT 'Community',
            contributed_by INTEGER, approved_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS theme_suggestions (
            id INTEGER PRIMARY KEY, guild_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL, name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            submitted_at INTEGER NOT NULL,
            reviewer_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS champion_choices (
            round_id INTEGER PRIMARY KEY,
            winner_id INTEGER NOT NULL, options_json TEXT NOT NULL,
            deadline INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS board_history (
            round_id INTEGER PRIMARY KEY, channel_id INTEGER NOT NULL,
            slot INTEGER NOT NULL, letters TEXT NOT NULL,
            theme TEXT, winning_answer TEXT, winner_id INTEGER,
            votes INTEGER NOT NULL, finished_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS board_prefs (
            channel_id INTEGER NOT NULL, slot INTEGER NOT NULL,
            difficulty TEXT NOT NULL DEFAULT 'standard',
            PRIMARY KEY(channel_id,slot)
        );
        CREATE TABLE IF NOT EXISTS notification_prefs (
            guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(guild_id,user_id)
        );
        """)
        for name in ('theme', 'difficulty'):
            if name not in {r['name'] for r in db.execute('PRAGMA table_info(rounds)')}:
                db.execute(f'ALTER TABLE rounds ADD COLUMN {name} TEXT')
        from themes import THEMES
        for category, names in THEMES.items():
            for name in names:
                db.execute('INSERT OR IGNORE INTO theme_bank(name,category) VALUES(?,?)',(name,category))
        cols = {r['name'] for r in db.execute('PRAGMA table_info(rounds)')}
        for name, definition in {
            'status_id': 'INTEGER', 'vote_id': 'INTEGER',
            'deadline': 'INTEGER', 'remaining_seconds': 'INTEGER',
            'paused': 'INTEGER NOT NULL DEFAULT 0',
            'automatic': 'INTEGER NOT NULL DEFAULT 1'
        }.items():
            if name not in cols:
                db.execute(f'ALTER TABLE rounds ADD COLUMN {name} {definition}')
        # Old 3.1 boards that were already in the separate voting phase stay playable.
        # Preserve their submissions/votes but give a fresh 24-hour combined window.
        db.execute("""UPDATE rounds SET phase='submitting', deadline=?, paused=0,
                   remaining_seconds=NULL WHERE phase='voting' AND id IN
                   (SELECT round_id FROM arena_board_slots)""",(int(time.time())+ENTRY_SECONDS,))
        # Existing populated boards retain their historical unrestricted prompt;
        # empty themed slots may safely receive a theme during migration.
        for row in db.execute("""SELECT s.slot,r.id,r.theme FROM arena_board_slots s
                JOIN rounds r ON r.id=s.round_id WHERE r.phase='submitting'""").fetchall():
            if row['slot'] in THEMED_SLOTS and row['theme'] is None:
                used=db.execute('SELECT 1 FROM entries WHERE round_id=? LIMIT 1',(row['id'],)).fetchone()
                if not used:
                    option=theme_options(db)
                    if option:db.execute('UPDATE rounds SET theme=? WHERE id=?',(rng.choice(option),row['id']))
        # Historical winner scores remain untouched. Legacy weekly event migration is idempotent.
        db.execute("""INSERT OR IGNORE INTO point_events(round_id,guild_id,user_id,kind,points,awarded_at)
                     SELECT round_id,guild_id,winner_id,'legacy_win',1,finished_at
                     FROM completed_results WHERE winner_id IS NOT NULL""")


def award_points(db, round_id, guild_id, user_id, kind, points):
    cur = db.execute('''INSERT OR IGNORE INTO point_events
        (round_id,guild_id,user_id,kind,points,awarded_at) VALUES(?,?,?,?,?,?)''',
        (round_id, guild_id, user_id, kind, points, int(time.time())))
    if cur.rowcount:
        db.execute('''INSERT INTO scores(guild_id,user_id,points) VALUES(?,?,?)
            ON CONFLICT(guild_id,user_id) DO UPDATE SET points=points+excluded.points''',
            (guild_id,user_id,points))
    return bool(cur.rowcount)


def week_start():
    now = datetime.now(timezone.utc)
    return int((now - timedelta(days=now.weekday())).replace(hour=0,minute=0,second=0,microsecond=0).timestamp())


def generate_letters(difficulty='standard'):
    if difficulty=='easy':
        length=rng.randint(3,4)
        pool='AAAAAABCDEEEEEEEEEFFGGHHHIIIIJLLLLMMNNNNNOOOOOPRRRSSSSTTTTUUUVWWYY'
    elif difficulty=='chaos':
        length=rng.randint(4,7)
        pool='AABCDEEFFFFGGHHIIJJKKLLMMNNOOPPQQRRSSSTTUUVVWWXXYYZZ'
    else:
        length=rng.randint(3,7)
        pool=LETTERS
    result=[rng.choice(pool) for _ in range(length)]
    if difficulty!='chaos' and not any(x in 'AEIOU' for x in result):
        result[rng.randrange(length)]=rng.choice('AEIOU')
    return ''.join(result)


def difficulty_for(db,channel_id,slot):
    row=db.execute('SELECT difficulty FROM board_prefs WHERE channel_id=? AND slot=?',(channel_id,slot)).fetchone()
    return row['difficulty'] if row else 'standard'


def check_words(letters, answer):
    words = answer.strip().split()
    return len(words) == len(letters) and all(w and w[0].upper()==ch for w,ch in zip(words,letters))


def rows_for(db, channel_id):
    return db.execute('''SELECT s.slot,r.* FROM arena_board_slots s
             JOIN rounds r ON r.id=s.round_id WHERE s.channel_id=? ORDER BY s.slot''', (channel_id,)).fetchall()


def slot_row(db, channel_id, slot):
    return db.execute('''SELECT s.slot,r.* FROM arena_board_slots s
          JOIN rounds r ON r.id=s.round_id WHERE s.channel_id=? AND s.slot=?''', (channel_id,slot)).fetchone()


def entry_count(db, rid):
    return db.execute('SELECT COUNT(*) FROM entries WHERE round_id=?',(rid,)).fetchone()[0]


def vote_count(db, rid):
    return db.execute('SELECT COUNT(*) FROM votes WHERE round_id=?',(rid,)).fetchone()[0]


def theme_options(db):
    recent = {row['theme'] for row in db.execute(
        'SELECT theme FROM board_history WHERE theme IS NOT NULL ORDER BY finished_at DESC LIMIT 20')}
    records = db.execute('SELECT name,category FROM theme_bank').fetchall()
    pool = [r for r in records if r['name'] not in recent] or records
    grouped = {}
    for row in pool:
        grouped.setdefault(row['category'],[]).append(row['name'])
    categories = list(grouped)
    rng.shuffle(categories)
    chosen = [rng.choice(grouped[c]) for c in categories[:3]]
    others = [r['name'] for r in pool if r['name'] not in chosen]
    while len(chosen)<3 and others:
        option=rng.choice(others); chosen.append(option);others.remove(option)
    return chosen


def replacement(db, old, slot, theme=None):
    other={x['letters'] for x in rows_for(db,old['channel_id'])}
    diff=difficulty_for(db,old['channel_id'],slot)
    letters=generate_letters(diff)
    while letters in other:letters=generate_letters(diff)
    cur=db.execute('''INSERT INTO rounds(guild_id,channel_id,letters,phase,automatic,deadline,theme)
        VALUES(?,?,?,'submitting',1,?,?)''',
        (old['guild_id'],old['channel_id'],letters,int(time.time())+ENTRY_SECONDS,theme if slot in THEMED_SLOTS else None))
    db.execute('UPDATE arena_board_slots SET round_id=? WHERE channel_id=? AND slot=?',
               (cur.lastrowid,old['channel_id'],slot))
    return cur.lastrowid,letters


def vote_eligible(db,r):
    return r['phase']=='submitting' and entry_count(db,r['id'])>=MIN_PLAYERS


def pass_count(db,rid):
    return db.execute('SELECT COUNT(*) FROM vote_passes WHERE round_id=?',(rid,)).fetchone()[0]

def ensure_boards(db, channel_id, guild_id):
    existing = {r['slot'] for r in rows_for(db,channel_id)}
    other_letters = {r['letters'] for r in rows_for(db,channel_id)}
    for slot in range(1,SLOTS+1):
        if slot not in existing:
            difficulty=difficulty_for(db,channel_id,slot)
            letters = generate_letters(difficulty)
            while letters in other_letters:
                letters=generate_letters(difficulty)
            other_letters.add(letters)
            cur = db.execute('''INSERT INTO rounds(guild_id,channel_id,letters,phase,automatic,deadline,theme)
                           VALUES(?,?,?,'submitting',1,?,?)''',
                           (guild_id,channel_id,letters,int(time.time())+ENTRY_SECONDS,
                            rng.choice(theme_options(db)) if slot in THEMED_SLOTS else None))
            db.execute('INSERT INTO arena_board_slots(channel_id,slot,round_id) VALUES(?,?,?)',
                       (channel_id,slot,cur.lastrowid))
    db.execute('INSERT OR IGNORE INTO arena_dashboards(channel_id,guild_id) VALUES(?,?)', (channel_id,guild_id))


def owner(interaction):
    return (interaction.guild_id is not None and
            (interaction.user.id == OWNER_ID or interaction.user.id == interaction.guild.owner_id))


def admin(interaction):
    if not interaction.guild or not isinstance(interaction.user,discord.Member):
        return owner(interaction)
    p=interaction.user.guild_permissions
    return owner(interaction) or p.manage_guild or p.administrator


def host(interaction, db):
    if not interaction.guild_id: return False
    if admin(interaction): return True
    if isinstance(interaction.user,discord.Member) and interaction.user.guild_permissions.manage_messages:
        return True  # Existing moderators retain access.
    return bool(db.execute('SELECT 1 FROM arena_hosts WHERE guild_id=? AND user_id=?',
                           (interaction.guild_id,interaction.user.id)).fetchone())


async def require_host(interaction):
    with connect() as db:
        ok=host(interaction,db)
    if not ok:
        await interaction.response.send_message('Only Arena Hosts or server moderators can manage boards.',ephemeral=True)
    return ok


def board_status(db,r):
    if r['phase']=='choice':return '🏆 Champion choosing next theme'
    n=entry_count(db,r['id'])
    if n<MIN_PLAYERS:return f'🟢 Entries open • needs {MIN_PLAYERS-n} more for voting'
    return '🟡 Entries + voting open'


def dashboard_embed(db,channel_id):
    embed=discord.Embed(title='🎤 ACRO ARENA 3.2 — FIVE LIVE BOARDS',
        description='**5 boards • 24 hours each** • voting opens at **2 entries**. '
                    '**+1 entry, +5 On Theme, +25 Daily winner**. '
                    'Vote, Pass, or mark another answer On Theme. Boards 1–2 are themed.',
        color=discord.Color.blurple())
    for r in rows_for(db,channel_id):
        timepart=(f'⏸️ Paused ({r["remaining_seconds"] or 0}s left)' if r['paused'] else
                  f'<t:{r["deadline"]}:R>' if r['deadline'] else '—')
        status=board_status(db,r)
        theme=f'🎭 {r["theme"]}' if r['theme'] else '🎲 Anything goes'
        value=(f'{status}\n{theme}\n'
               f'👥 {entry_count(db,r["id"])} entries • 🗳️ {vote_count(db,r["id"])} votes • '
               f'⏭️ {pass_count(db,r["id"])} passes\n'
               f'⏳ {"Champion choice closes" if r["phase"]=="choice" else "Board closes"}: {timepart}')
        embed.add_field(name=f'BOARD {r["slot"]} — {" · ".join(r["letters"])}',value=value,inline=False)
    embed.set_footer(text='Select board • My Progress • Help • /acronym leaderboard')
    return embed


intents=discord.Intents.default()
bot=commands.Bot(command_prefix=commands.when_mentioned,intents=intents)
group=app_commands.Group(name='acronym',description='Acronym Arena party game')


async def get_channel(channel_id):
    return bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)


async def refresh_dashboard(channel_id):
    with connect() as db:
        dash=db.execute('SELECT message_id FROM arena_dashboards WHERE channel_id=?',(channel_id,)).fetchone()
        if not dash:return
        embed=dashboard_embed(db,channel_id)
        message_id=dash['message_id']
    try:
        channel=await get_channel(channel_id)
        if message_id:
            try:
                msg=await channel.fetch_message(message_id)
                await msg.edit(embed=embed,view=DashboardView(),allowed_mentions=discord.AllowedMentions.none())
                return
            except (discord.NotFound,discord.Forbidden):
                pass
        msg=await channel.send(embed=embed,view=DashboardView(),allowed_mentions=discord.AllowedMentions.none())
        with connect() as db:
            db.execute('UPDATE arena_dashboards SET message_id=? WHERE channel_id=?',(msg.id,channel_id))
    except discord.HTTPException as exc:
        print(f'Dashboard {channel_id} error: {exc}')


def progress_text(db,channel_id,user_id):
    lines=[]; entered=0; decided=0; available=0
    for r in rows_for(db,channel_id):
        entry=db.execute('SELECT 1 FROM entries WHERE round_id=? AND user_id=?',(r['id'],user_id)).fetchone()
        vote=db.execute('SELECT 1 FROM votes WHERE round_id=? AND voter_id=?',(r['id'],user_id)).fetchone()
        passed=db.execute('SELECT 1 FROM vote_passes WHERE round_id=? AND voter_id=?',(r['id'],user_id)).fetchone()
        marks=db.execute('SELECT COUNT(*) FROM theme_marks WHERE round_id=? AND voter_id=?',(r['id'],user_id)).fetchone()[0]
        if entry:entered+=1
        if vote or passed:decided+=1
        eligible=vote_eligible(db,r)
        if eligible:available+=1
        status='✅ Voted' if vote else '⏭️ Passed' if passed else '⭕ Not voted' if eligible else '⏳ Voting unavailable'
        lines.append(f'**#{r["slot"]} — {" · ".join(r["letters"])}**\n'
                     f'{"✅ Entered" if entry else "⭕ Not entered"} • {status}'
                     + (f' • 🎭 {marks} reviewed' if r['theme'] else ''))
    return '\n\n'.join(lines)+f'\n\n**Entries:** {entered}/{SLOTS} • **Voting decisions:** {decided}/{available} available'


class SubmitModal(discord.ui.Modal,title='Acronym Arena — Submit / Edit'):
    phrase=discord.ui.TextInput(label='Your phrase',placeholder='Funny Badgers Steal Helicopters',max_length=200)
    def __init__(self,channel_id,round_id,letters,previous=None):
        super().__init__(timeout=300)
        self.channel_id=channel_id;self.round_id=round_id;self.letters=letters
        self.phrase.label=f'Expand {letters}'
        if previous:self.phrase.default=previous[:200]

    async def on_submit(self,interaction):
        phrase=str(self.phrase).strip()
        if not check_words(self.letters,phrase):
            await interaction.response.send_message('Use exactly '+str(len(self.letters))+
                ' words starting with **'+ ' · '.join(self.letters)+'**.',ephemeral=True)
            return
        async with channel_lock(self.channel_id):
            with connect() as db:
                r=db.execute('SELECT * FROM rounds WHERE id=? AND channel_id=?',(self.round_id,self.channel_id)).fetchone()
                if not r or r['phase']!='submitting' or not r['deadline'] or r['deadline']<=int(time.time()):
                    await interaction.response.send_message('Entries are closed for this board.',ephemeral=True)
                    return
                existing=db.execute('SELECT id FROM entries WHERE round_id=? AND user_id=?',(self.round_id,interaction.user.id)).fetchone()
                if not existing and entry_count(db,self.round_id)>=MAX_ENTRIES:
                    await interaction.response.send_message('This board has reached the 25-entry voting limit.',ephemeral=True)
                    return
                db.execute('''INSERT INTO entries(round_id,user_id,answer) VALUES(?,?,?)
                    ON CONFLICT(round_id,user_id) DO UPDATE SET answer=excluded.answer''',
                    (self.round_id,interaction.user.id,phrase))
                earned=award_points(db,self.round_id,r['guild_id'],interaction.user.id,'entry',1)
                notify_ids=notify_participants(db,self.round_id,r['guild_id']) if earned else []
        await interaction.response.send_message('✅ Entry saved privately: **'+discord.utils.escape_markdown(phrase)+
            '**\n'+('**+1 participation point!**' if earned else 'Your participation point was already awarded.'),ephemeral=True)
        await refresh_dashboard(self.channel_id)
        if notify_ids:await send_vote_reminders(notify_ids,self._slot_for_round())

    def _slot_for_round(self):
        with connect() as db:
            row=db.execute('SELECT slot FROM arena_board_slots WHERE round_id=?',(self.round_id,)).fetchone()
            return row['slot'] if row else '?'


class VoteSelect(discord.ui.Select):
    def __init__(self,channel_id,round_id,numbered_candidates):
        self.channel_id=channel_id;self.round_id=round_id
        # Keep original answer numbers when the voter's own entry is hidden.
        opts=[discord.SelectOption(label=f'Answer {number}',
              description=e['answer'][:100],value=str(e['id']))
              for number,e in numbered_candidates]
        super().__init__(placeholder='CHOOSE AN ANSWER — your vote is saved immediately',options=opts)

    async def callback(self,interaction):
        choice=int(self.values[0]);rid=self.round_id
        async with channel_lock(self.channel_id):
            with connect() as db:
                r=db.execute('SELECT * FROM rounds WHERE id=? AND channel_id=?',(rid,self.channel_id)).fetchone()
                target=db.execute('SELECT user_id,answer FROM entries WHERE id=? AND round_id=?',(choice,rid)).fetchone()
                if not r or not vote_eligible(db,r) or not r['deadline'] or r['deadline']<=int(time.time()) or not target:
                    await interaction.response.send_message('Voting is closed or that answer is unavailable. Your vote was NOT saved.',ephemeral=True);return
                if target['user_id']==interaction.user.id:
                    await interaction.response.send_message('You cannot vote for yourself. Your vote was NOT saved.',ephemeral=True);return
                db.execute('DELETE FROM vote_passes WHERE round_id=? AND voter_id=?',(rid,interaction.user.id))
                db.execute("""INSERT INTO votes(round_id,voter_id,entry_id) VALUES(?,?,?)
                    ON CONFLICT(round_id,voter_id) DO UPDATE SET entry_id=excluded.entry_id""",
                    (rid,interaction.user.id,choice))
            with connect() as verify:
                saved=verify.execute('SELECT entry_id FROM votes WHERE round_id=? AND voter_id=?',
                                     (rid,interaction.user.id)).fetchone()
            if not saved or saved['entry_id']!=choice:
                await interaction.response.send_message('⚠️ Your vote was NOT confirmed. Please try again.',ephemeral=True)
                return
        answer=discord.utils.escape_markdown(target['answer'])
        await interaction.response.edit_message(
            content=f'✅ **VOTE RECORDED AND VERIFIED**\nYou voted for: **{answer}**\n'
                    'Your choice is saved. To change it, open the board and click **Vote / Change Vote** again.',
            view=None)
        await refresh_dashboard(self.channel_id)

class ThemeMarkSelect(discord.ui.Select):
    def __init__(self,channel_id,round_id,entries):
        self.channel_id=channel_id;self.round_id=round_id
        options=[discord.SelectOption(label=f'Answer {i}',description=e['answer'][:100],value=str(e['id']))
                 for i,e in enumerate(entries,1)]
        super().__init__(placeholder='Mark entries that fit the theme (toggle)',options=options)

    async def callback(self,interaction):
        eid=int(self.values[0])
        async with channel_lock(self.channel_id):
            with connect() as db:
                r=db.execute('SELECT * FROM rounds WHERE id=?',(self.round_id,)).fetchone()
                entry=db.execute('SELECT user_id FROM entries WHERE id=? AND round_id=?',(eid,self.round_id)).fetchone()
                if not r or not r['theme'] or not vote_eligible(db,r) or not r['deadline'] or r['deadline']<=time.time() or not entry or entry['user_id']==interaction.user.id:
                    await interaction.response.send_message('Theme review is unavailable.',ephemeral=True);return
                existing=db.execute('SELECT 1 FROM theme_marks WHERE round_id=? AND entry_id=? AND voter_id=?',
                                    (self.round_id,eid,interaction.user.id)).fetchone()
                if existing:
                    db.execute('DELETE FROM theme_marks WHERE round_id=? AND entry_id=? AND voter_id=?',(self.round_id,eid,interaction.user.id))
                else:
                    db.execute('INSERT INTO theme_marks(round_id,entry_id,voter_id) VALUES(?,?,?)',
                               (self.round_id,eid,interaction.user.id))
        await interaction.response.send_message('🎭 On Theme endorsement '+('removed.' if existing else 'added.')+' One endorsement qualifies the entry for +5 at results.',ephemeral=True)


class VoteView(discord.ui.View):
    def __init__(self,channel_id,round_id,entries,own_id,themed=False):
        super().__init__(timeout=300)
        self.channel_id=channel_id;self.round_id=round_id
        candidates=[(i,e) for i,e in enumerate(entries,1) if e['user_id']!=own_id]
        if candidates:
            self.add_item(VoteSelect(channel_id,round_id,candidates))
            if themed:self.add_item(ThemeMarkSelect(channel_id,round_id,[e for _,e in candidates]))

    @discord.ui.button(label='Pass / Withdraw Vote',style=discord.ButtonStyle.secondary,emoji='⏭️')
    async def pass_vote(self,interaction,button):
        async with channel_lock(self.channel_id):
            with connect() as db:
                r=db.execute('SELECT * FROM rounds WHERE id=?',(self.round_id,)).fetchone()
                if not r or not vote_eligible(db,r) or not r['deadline'] or r['deadline']<=time.time():
                    await interaction.response.send_message('Voting is closed.',ephemeral=True);return
                db.execute('DELETE FROM votes WHERE round_id=? AND voter_id=?',(self.round_id,interaction.user.id))
                db.execute('INSERT OR IGNORE INTO vote_passes(round_id,voter_id) VALUES(?,?)',(self.round_id,interaction.user.id))
        await interaction.response.send_message('⏭️ Passed. You can still vote later.',ephemeral=True)
        await refresh_dashboard(self.channel_id)


class BoardDetailView(discord.ui.View):
    def __init__(self,channel_id,slot):
        super().__init__(timeout=300)
        self.channel_id=channel_id;self.slot=slot

    @discord.ui.button(label='Submit / Edit',style=discord.ButtonStyle.primary,emoji='✍️')
    async def submit(self,interaction,button):
        with connect() as db:
            r=slot_row(db,self.channel_id,self.slot)
            old=db.execute('SELECT answer FROM entries WHERE round_id=? AND user_id=?',(r['id'],interaction.user.id)).fetchone() if r else None
        if not r or r['phase']!='submitting' or not r['deadline'] or r['deadline']<=int(time.time()):
            await interaction.response.send_message('This board is not accepting entries.',ephemeral=True);return
        await interaction.response.send_modal(SubmitModal(self.channel_id,r['id'],r['letters'],old['answer'] if old else None))

    @discord.ui.button(label='Vote / Change Vote',style=discord.ButtonStyle.success,emoji='🗳️')
    async def vote(self,interaction,button):
        with connect() as db:
            r=slot_row(db,self.channel_id,self.slot)
            entries=db.execute('SELECT id,user_id,answer FROM entries WHERE round_id=? ORDER BY id',(r['id'],)).fetchall() if r else []
            n=len(entries)
            existing=db.execute('''SELECT e.answer FROM votes v JOIN entries e ON e.id=v.entry_id
                WHERE v.round_id=? AND v.voter_id=?''',(r['id'],interaction.user.id)).fetchone() if r else None
            passed=db.execute('SELECT 1 FROM vote_passes WHERE round_id=? AND voter_id=?',(r['id'],interaction.user.id)).fetchone() if r else None
            marks=db.execute('SELECT entry_id FROM theme_marks WHERE round_id=? AND voter_id=?',(r['id'],interaction.user.id)).fetchall() if r else []
        if not r or r['phase']!='submitting' or n<MIN_PLAYERS or not r['deadline'] or r['deadline']<=int(time.time()):
            await interaction.response.send_message('Voting is not open on this board.',ephemeral=True);return
        msg=('✅ You have voted for: **'+discord.utils.escape_markdown(existing['answer'])+'**\nChoose below to change your vote.'
             if existing else '⏭️ **Passed** — You may still vote.' if passed else '⭕ **Not voted yet.** Pick a favorite or Pass.')
        await interaction.response.send_message(msg + '\n**A vote counts only when you see ✅ VOTE RECORDED AND VERIFIED.**' + (f'\n🎭 Your on-theme endorsements: {len(marks)}. Use the theme menu independently of Vote/Pass.' if r['theme'] else ''),view=VoteView(self.channel_id,r['id'],entries,interaction.user.id,bool(r['theme'])),ephemeral=True)

    @discord.ui.button(label='My Vote Status',style=discord.ButtonStyle.secondary,emoji='✅')
    async def vote_status(self,interaction,button):
        with connect() as db:
            r=slot_row(db,self.channel_id,self.slot)
            if not r:
                await interaction.response.send_message('Board is no longer active.',ephemeral=True);return
            entry=db.execute('SELECT answer FROM entries WHERE round_id=? AND user_id=?',(r['id'],interaction.user.id)).fetchone()
            vote=db.execute('''SELECT e.answer FROM votes v JOIN entries e ON e.id=v.entry_id
                    WHERE v.round_id=? AND v.voter_id=?''',(r['id'],interaction.user.id)).fetchone()
            passed=db.execute('SELECT 1 FROM vote_passes WHERE round_id=? AND voter_id=?',(r['id'],interaction.user.id)).fetchone()
            eligible=vote_eligible(db,r)
        status=('✅ **Voted** — '+discord.utils.escape_markdown(vote['answer']) if vote else
                '⏭️ **Passed**' if passed else '⭕ **Not voted yet**' if eligible else '⏳ Voting has not opened')
        await interaction.response.send_message(f'**Board {self.slot}**\n'
            f'{"✅ Entered" if entry else "⭕ Not entered"}\n{status}',ephemeral=True)


class BoardSelect(discord.ui.Select):
    def __init__(self):
        super().__init__(placeholder='Choose a board (1–5)',custom_id='arena3:select-board',options=[
            discord.SelectOption(label=f'Board {i}',value=str(i),description='Open this board') for i in range(1,SLOTS+1)])

    async def callback(self,interaction):
        slot=int(self.values[0])
        with connect() as db:
            r=slot_row(db,interaction.channel_id,slot)
            if not r:
                await interaction.response.send_message('No boards are active here. Ask a host to use /acronym start.',ephemeral=True);return
            entry=db.execute('SELECT answer FROM entries WHERE round_id=? AND user_id=?',(r['id'],interaction.user.id)).fetchone()
            voted=db.execute('SELECT 1 FROM votes WHERE round_id=? AND voter_id=?',(r['id'],interaction.user.id)).fetchone()
            passed=db.execute('SELECT 1 FROM vote_passes WHERE round_id=? AND voter_id=?',(r['id'],interaction.user.id)).fetchone()
            phase=r['phase']; n=entry_count(db,r['id'])
        desc=(f'**{" · ".join(r["letters"])}**\n{board_status_simple(phase,n)}\n'
              f'Entries: **{n}** • {"✅ Entered" if entry else "⭕ Not entered"}\n'
              f'{"✅ Voted" if voted else "⏭️ Passed" if passed else "⭕ Not voted" if n>=MIN_PLAYERS and phase=="submitting" else "⏳ Voting pending"}\n'
              f'Deadline: {"⏸️ Paused" if r["paused"] else f"<t:{r['deadline']}:R>"}')
        await interaction.response.send_message(desc,view=BoardDetailView(interaction.channel_id,slot),ephemeral=True)


def board_status_simple(phase,n):
    if phase=='choice':return '🏆 Champion selecting next theme'
    return '🟡 Entries and voting open' if n>=MIN_PLAYERS else '🟢 Entries open'


# Help content is kept beside the commands and describes the real 3.0 interfaces.
HELP_SECTIONS = {
 'players': [
    ('`/acronym help` / **Help button**','Private help and instructions.'),
    ('`/acronym boards`','See all five boards; use Select Board to enter or vote.'),
    ('`/acronym progress`','See entered, voted, passed and reviewed boards.'),
    ('`/acronym status`','View active boards and countdowns.'),
    ('`/acronym leaderboard` / `profile`','All-time or weekly points; personal stats.'),
    ('**Submit / Edit**','Submit once for +1 point; edit anytime until the deadline.'),
    ('**Vote / Pass / On Theme**','Voting opens with 2 different entries; you may pass or change your vote.'),
    ('`/acronym champion`','A winner chooses the next theme for a themed board.'),
    ('`/acronym classics`','Browse previous winners and answers.'),
    ('`/acronym suggest_theme` / `my_suggestions`','Propose a theme and check its review status.'),
    ('`/acronym notifications`','Opt into or out of private voting reminders.'),
 ],
 'hosts': [
    ('`/acronym start`','Create/recover five boards.'),
    ('`/acronym solve board:1–5` / `vote`','Finish one eligible board early and reveal results.'),
    ('`/acronym finish board:1–5`','Same early-finish action.'),
    ('`/acronym pause` / `resume`','Pause or resume a board, including Champion Choice.'),
    ('`/acronym theme_queue`','Privately review suggested themes.'),
    ('`/acronym difficulty`','Set Easy / Standard / Chaos for the next acronym in a board.'),
    ('`/acronym theme_approve` / `theme_reject`','Approve/reject a numbered suggestion.'),
 ],
 'admins': [
    ('`/acronym host_add`','Authorize a trusted friend to operate the game.'),
    ('`/acronym host_remove`','Remove that access.'),
 ],
 'rules': [
    ('**Five boards**','24h each, 3–7 weighted letters, two themed and three free-form.'),
    ('**Voting**','Available at 2 entrants; submissions and voting remain open together.'),
    ('**Vote or Pass**','One favorite vote or explicit Pass; can change until close.'),
    ('**Theme review**','Independently endorse other answers On Theme; one endorsement awards +5 at results.'),
    ('**Points**','+1 first entry, +5 On Theme, +25 sole Daily win.'),
    ('**Ties/no votes**','No winner bonus; participation and theme points still count.'),
    ('**Champion Choice**','Winner of a themed board gets 1 hour to choose from 3 themes.'),
    ('**No winner**','A fresh themed board is generated automatically.'),
 ]
}


def help_embed(section='players', phase_hint=None):
    heading = {'players':'👥 Player commands & buttons',
               'hosts':'🎮 Arena Host controls',
               'admins':'🛡️ Admin / owner commands',
               'rules':'🏆 Game rules & scoring'}[section]
    intro = ('Choose a category below to learn **what to use and when**. '
             'This guide describes the installed five-board game.')
    if phase_hint:
        intro += '\n\n**Right now:** ' + phase_hint
    embed=discord.Embed(title='❓ ACRO ARENA — HELP CENTER',
                        description=intro, color=discord.Color.blurple())
    embed.add_field(name=heading,
                    value='\n\n'.join(f'{name}\n{meaning}' for name,meaning in HELP_SECTIONS[section]),
                    inline=False)
    embed.set_footer(text='Help is private to you • Select another category below')
    return embed


def help_phase_hint(channel_id):
    with connect() as db:
        boards=rows_for(db,channel_id)
    if not boards:
        return 'No boards in this channel. Ask a host to use `/acronym start`.'
    entries=sum(r['phase']=='submitting' for r in boards)
    with connect() as db:voting=sum(vote_eligible(db,r) for r in boards)
    return f'{entries} accepting entries, {voting} eligible for voting. Use `/acronym boards` to choose.'


class HelpCategorySelect(discord.ui.Select):
    def __init__(self):
        super().__init__(placeholder='Help topic — Players, Hosts, Admins, Rules',
                         options=[
                             discord.SelectOption(label='Players',value='players',emoji='👥'),
                             discord.SelectOption(label='Arena Hosts',value='hosts',emoji='🎮'),
                             discord.SelectOption(label='Admins / Owner',value='admins',emoji='🛡️'),
                             discord.SelectOption(label='Rules & Scoring',value='rules',emoji='🏆'),
                         ])

    async def callback(self,interaction:discord.Interaction):
        # The menu itself is an ephemeral response, so changing sections stays private.
        await interaction.response.edit_message(embed=help_embed(self.values[0]),view=self.view)


class HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(HelpCategorySelect())


async def send_help(interaction:discord.Interaction):
    await interaction.response.send_message(
        embed=help_embed(phase_hint=help_phase_hint(interaction.channel_id)),
        view=HelpView(), ephemeral=True)


class DashboardView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(BoardSelect())

    @discord.ui.button(label='My Progress / Votes',style=discord.ButtonStyle.secondary,emoji='📋',custom_id='arena3:progress')
    async def progress(self,interaction,button):
        with connect() as db:
            rows=rows_for(db,interaction.channel_id)
            if not rows:
                await interaction.response.send_message('No active boards here.',ephemeral=True);return
            msg=progress_text(db,interaction.channel_id,interaction.user.id)
        await interaction.response.send_message('📋 **MY ARENA PROGRESS**\n\n'+msg,ephemeral=True)

    @discord.ui.button(label='Help',style=discord.ButtonStyle.secondary,emoji='❓',custom_id='arena3:help')
    async def help_button(self,interaction,button):
        await send_help(interaction)


async def announce(channel_id,message):
    try:
        channel=await get_channel(channel_id)
        await channel.send(message,allowed_mentions=discord.AllowedMentions.none())
    except discord.HTTPException as exc:
        print(f'Announcement failed: {exc}')


def notify_participants(db, round_id, guild_id):
    if entry_count(db,round_id)!=MIN_PLAYERS:return []
    rows=db.execute('''SELECT DISTINCT e.user_id FROM entries e JOIN notification_prefs p
       ON p.user_id=e.user_id AND p.guild_id=? AND p.enabled=1 WHERE e.round_id=?''',(guild_id,round_id)).fetchall()
    return [x['user_id'] for x in rows]


async def notify_opted(guild_id, text, exclude=None):
    exclude=set(exclude or [])
    with connect() as db:
        users=[r['user_id'] for r in db.execute(
            'SELECT user_id FROM notification_prefs WHERE guild_id=? AND enabled=1',(guild_id,)).fetchall()]
    for uid in users:
        if uid in exclude:continue
        try:
            user=await bot.fetch_user(uid)
            await user.send(text)
        except (discord.Forbidden,discord.HTTPException):pass


async def send_vote_reminders(user_ids,slot):
    for uid in user_ids:
        try:
            person=await bot.fetch_user(uid)
            await person.send(f'🗳️ Acro Arena Board {slot} now has 2 entries and is open for voting.')
        except (discord.Forbidden,discord.HTTPException):pass


async def finish_board(channel_id,slot,round_id):
    async with channel_lock(channel_id):
        with connect() as db:
            r=slot_row(db,channel_id,slot)
            if not r or r['id']!=round_id or r['phase']!='submitting':return False
            tally=db.execute('''SELECT e.id,e.user_id,e.answer,COUNT(v.voter_id) tally
                FROM entries e LEFT JOIN votes v ON v.entry_id=e.id AND v.round_id=e.round_id
                WHERE e.round_id=? GROUP BY e.id ORDER BY tally DESC,e.id''',(round_id,)).fetchall()
            high=tally[0]['tally'] if tally else 0
            top=[x for x in tally if x['tally']==high] if high else []
            winner=top[0]['user_id'] if len(top)==1 else None
            stamp=int(time.time())
            awarded=[]
            if r['theme']:
                for x in tally:
                    endorsed=db.execute('SELECT 1 FROM theme_marks WHERE round_id=? AND entry_id=? LIMIT 1',
                                        (round_id,x['id'])).fetchone()
                    if endorsed and award_points(db,round_id,r['guild_id'],x['user_id'],'on_theme',5):
                        awarded.append(x['user_id'])
            if winner is not None:
                award_points(db,round_id,r['guild_id'],winner,'winner',25)
            db.execute('''INSERT OR IGNORE INTO completed_results(round_id,guild_id,finished_at,winner_id,winning_votes,tie)
                VALUES(?,?,?,?,?,?)''',(round_id,r['guild_id'],stamp,winner,high,int(len(top)>1)))
            db.execute('''INSERT OR IGNORE INTO board_history(round_id,channel_id,slot,letters,theme,winning_answer,winner_id,votes,finished_at)
                VALUES(?,?,?,?,?,?,?,?,?)''',
                (round_id,channel_id,slot,r['letters'],r['theme'],top[0]['answer'] if winner else None,winner,high,stamp))
            db.execute("UPDATE rounds SET phase='finished',deadline=NULL WHERE id=?",(round_id,))
            if slot in THEMED_SLOTS and winner is not None:
                options=theme_options(db)
                deadline=stamp+CHOICE_SECONDS
                db.execute("UPDATE rounds SET phase='choice',deadline=?,paused=0 WHERE id=?",(deadline,round_id))
                db.execute('INSERT OR REPLACE INTO champion_choices(round_id,winner_id,options_json,deadline) VALUES(?,?,?,?)',
                           (round_id,winner,json.dumps(options),deadline))
                next_id=None; newletters=None
            else:
                next_theme=rng.choice(theme_options(db)) if slot in THEMED_SLOTS else None
                next_id,newletters=replacement(db,r,slot,next_theme)
                options=None
            letters=r['letters']
    details='\n'.join(f'**{x["tally"]} vote(s)** — {discord.utils.escape_markdown(x["answer"])} — <@{x["user_id"]}>' for x in tally)
    if winner is not None:outcome=f'🏆 <@{winner}> wins **+25** bonus points!'
    elif top:outcome='🤝 Tie — no winner bonus.'
    else:outcome='No favorite votes — no winner bonus.'
    theme_text=f'\n🎭 Theme: **{r["theme"]}** • On Theme +5: '+(', '.join(f'<@{x}>' for x in awarded) if awarded else 'none') if r['theme'] else ''
    if options:
        extra=(f'🏆 Champion Choice: <@{winner}> can run `/acronym champion board:{slot}` '
               f'to choose the next theme. One hour to choose; then the bot chooses automatically.')
    else:
        extra=f'🎲 New Board {slot}: **{" · ".join(newletters)}** (24h).'
    await announce(channel_id,f'🎉 **BOARD {slot} RESULTS — {" · ".join(letters)}**\n\n'
                   f'{details or "No entries"}\n\n{outcome}{theme_text}\n\n{extra}')
    await refresh_dashboard(channel_id)
    if winner is not None:
        await notify_opted(r['guild_id'],f'🏆 You may have a new Acro Arena result in Board {slot}. Check the server for the winner announcement.',exclude=[])
    if next_id:schedule(next_id)
    else:schedule(round_id)
    return True


async def finalize_champion(channel_id,slot,round_id,theme=None):
    async with channel_lock(channel_id):
        with connect() as db:
            r=slot_row(db,channel_id,slot)
            if not r or r['id']!=round_id or r['phase']!='choice':return False
            choice=db.execute('SELECT * FROM champion_choices WHERE round_id=?',(round_id,)).fetchone()
            if not choice:return False
            opts=json.loads(choice['options_json'])
            selected=theme if theme in opts else rng.choice(opts)
            new_id,letters=replacement(db,r,slot,selected)
            db.execute('DELETE FROM champion_choices WHERE round_id=?',(round_id,))
            db.execute("UPDATE rounds SET phase='finished',deadline=NULL WHERE id=?",(round_id,))
    await announce(channel_id,f'🎭 **Board {slot} — Champion’s Choice**: **{selected}**\n'
                   f'🎲 New letters: **{" · ".join(letters)}** • 24 hours to play!')
    await refresh_dashboard(channel_id)
    await notify_opted(r['guild_id'],f'🎲 Fresh Acro Arena Board {slot} is live: {" · ".join(letters)} (24h).')
    schedule(new_id)
    return True


def schedule(round_id):
    old=timers.pop(round_id,None)
    if old and old is not asyncio.current_task():old.cancel()
    with connect() as db:
        r=db.execute('SELECT * FROM rounds WHERE id=?',(round_id,)).fetchone()
        slot=db.execute('SELECT slot FROM arena_board_slots WHERE round_id=?',(round_id,)).fetchone()
    if r and slot and r['phase'] in ('submitting','choice') and r['deadline']:
        timers[round_id]=asyncio.create_task(run_timer(round_id))


async def run_timer(round_id):
    try:
        while True:
            with connect() as db:
                r=db.execute('SELECT * FROM rounds WHERE id=?',(round_id,)).fetchone()
                mapping=db.execute('SELECT slot FROM arena_board_slots WHERE round_id=?',(round_id,)).fetchone()
            if not r or not mapping or not r['deadline'] or r['phase'] not in ('submitting','choice'):return
            await asyncio.sleep(max(0,r['deadline']-time.time()))
            with connect() as db:
                latest=db.execute('SELECT * FROM rounds WHERE id=?',(round_id,)).fetchone()
            if not latest or not latest['deadline']:return
            if latest['deadline']>time.time():continue
            if latest['phase']=='submitting':await finish_board(r['channel_id'],mapping['slot'],round_id)
            elif latest['phase']=='choice':await finalize_champion(r['channel_id'],mapping['slot'],round_id)
            return
    except asyncio.CancelledError:pass
    except Exception as exc:print(f'Timer {round_id} failure: {exc!r}')


@group.command(name='help',description='Private interactive help for players, hosts and admins')
async def help_command(interaction:discord.Interaction):
    await send_help(interaction)


@group.command(name='start',description='Host: create/recover five simultaneous 24-hour boards')
async def start(interaction:discord.Interaction):
    if not await require_host(interaction):return
    await interaction.response.defer(ephemeral=True)
    async with channel_lock(interaction.channel_id):
        with connect() as db:
            ensure_boards(db,interaction.channel_id,interaction.guild_id)
            rows=rows_for(db,interaction.channel_id)
    await refresh_dashboard(interaction.channel_id)
    for r in rows:schedule(r['id'])
    await interaction.followup.send('✅ Five boards are active. The dashboard is posted/updated above.',ephemeral=True)


@group.command(name='boards',description='Show all five boards and the live dashboard')
async def boards(interaction:discord.Interaction):
    with connect() as db:
        if not rows_for(db,interaction.channel_id):
            await interaction.response.send_message('No boards yet. Ask an Arena Host to use `/acronym start`.',ephemeral=True);return
        emb=dashboard_embed(db,interaction.channel_id)
    await interaction.response.send_message(embed=emb,view=BoardDetailLauncher(),ephemeral=True)


class BoardDetailLauncher(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(BoardSelect())
    @discord.ui.button(label='My Progress / Votes',style=discord.ButtonStyle.secondary,emoji='📋')
    async def progress(self,interaction,button):
        with connect() as db:msg=progress_text(db,interaction.channel_id,interaction.user.id)
        await interaction.response.send_message(msg,ephemeral=True)


# Help is also available from the public pinned dashboard and /acronym help.


@group.command(name='status',description='Show the five active boards')
async def status(interaction:discord.Interaction):
    with connect() as db:
        if not rows_for(db,interaction.channel_id):
            await interaction.response.send_message('No active boards here.',ephemeral=True);return
        emb=dashboard_embed(db,interaction.channel_id)
    await interaction.response.send_message(embed=emb,ephemeral=True)


@group.command(name='progress',description='Privately check your five entries and voting status')
async def progress(interaction:discord.Interaction):
    with connect() as db:
        if not rows_for(db,interaction.channel_id):
            await interaction.response.send_message('No active boards here.',ephemeral=True);return
        msg=progress_text(db,interaction.channel_id,interaction.user.id)
    await interaction.response.send_message('📋 **MY ARENA PROGRESS**\n\n'+msg,ephemeral=True)


@group.command(name='solve',description='Host: finish a board early and reveal the result')
async def solve(interaction:discord.Interaction,board:app_commands.Range[int,1,5]):
    if not await require_host(interaction):return
    with connect() as db:r=slot_row(db,interaction.channel_id,board)
    if not r or r['phase']!='submitting':
        await interaction.response.send_message('That board is not accepting entries.',ephemeral=True);return
    with connect() as db:n=entry_count(db,r['id'])
    if n<MIN_PLAYERS:
        await interaction.response.send_message(f'Board {board} needs 2 entries; currently {n}.',ephemeral=True);return
    await interaction.response.defer(ephemeral=True)
    ok=await finish_board(interaction.channel_id,board,r['id'])
    await interaction.followup.send('✅ Results published.' if ok else 'Already finished.',ephemeral=True)


@group.command(name='vote',description='How to vote for an answer without ending a round')
async def vote(interaction:discord.Interaction,board:app_commands.Range[int,1,5]):
    with connect() as db:
        r=slot_row(db,interaction.channel_id,board)
    if not r:
        await interaction.response.send_message('No active round on that board. Use /acronym boards to find an active one.',ephemeral=True)
        return
    await interaction.response.send_message(
        f'🗳️ **Voting on Board {board} — {" · ".join(r["letters"])}**\n'
        'Use the **Vote / Change Vote** button below to pick an answer. '
        '**This command will never end the round.**',
        view=BoardDetailView(interaction.channel_id,board),ephemeral=True)


@group.command(name='finish',description='Host: finish an eligible board early')
async def finish(interaction:discord.Interaction,board:app_commands.Range[int,1,5]):
    await solve.callback(interaction,board)



@group.command(name='pause',description='Host: pause one board countdown')
async def pause(interaction:discord.Interaction,board:app_commands.Range[int,1,5]):
    if not await require_host(interaction):return
    async with channel_lock(interaction.channel_id):
        with connect() as db:
            r=slot_row(db,interaction.channel_id,board)
            if not r or not r['deadline'] or r['paused']:
                await interaction.response.send_message('No running timer on that board.',ephemeral=True);return
            remaining=max(1,r['deadline']-int(time.time()))
            db.execute('UPDATE rounds SET deadline=NULL,paused=1,remaining_seconds=? WHERE id=?',(remaining,r['id']))
    old=timers.pop(r['id'],None)
    if old:old.cancel()
    await interaction.response.send_message(f'⏸️ Board {board} paused with {remaining}s remaining.',ephemeral=True)
    await refresh_dashboard(interaction.channel_id)


@group.command(name='resume',description='Host: resume one paused board countdown')
async def resume(interaction:discord.Interaction,board:app_commands.Range[int,1,5]):
    if not await require_host(interaction):return
    async with channel_lock(interaction.channel_id):
        with connect() as db:
            r=slot_row(db,interaction.channel_id,board)
            if not r or not r['paused']:
                await interaction.response.send_message('That board is not paused.',ephemeral=True);return
            deadline=int(time.time())+max(1,r['remaining_seconds'] or 1)
            db.execute('UPDATE rounds SET deadline=?,paused=0,remaining_seconds=NULL WHERE id=?',(deadline,r['id']))
    schedule(r['id'])
    await interaction.response.send_message(f'▶️ Board {board} resumed. Ends <t:{deadline}:R>.',ephemeral=True)
    await refresh_dashboard(interaction.channel_id)


@group.command(name='leaderboard',description='All-time or this-week point standings')
@app_commands.choices(period=[app_commands.Choice(name='All time',value='all'),app_commands.Choice(name='This week (UTC)',value='week')])
async def leaderboard(interaction:discord.Interaction,period:app_commands.Choice[str]=None):
    weekly=bool(period and period.value=='week')
    with connect() as db:
        if weekly:
            results=db.execute('''SELECT user_id,SUM(points) points FROM point_events
                 WHERE guild_id=? AND awarded_at>=? GROUP BY user_id ORDER BY points DESC,user_id LIMIT 10''',
                (interaction.guild_id,week_start())).fetchall()
        else:
            results=db.execute('SELECT user_id,points FROM scores WHERE guild_id=? ORDER BY points DESC,user_id LIMIT 10',
                                (interaction.guild_id,)).fetchall()
    text='\n'.join(f'**{i}.** <@{r["user_id"]}> — {r["points"]} points' for i,r in enumerate(results,1))
    await interaction.response.send_message(('📅 **WEEKLY**' if weekly else '🏆 **ALL-TIME**')+' LEADERBOARD\n'+(text or 'No scores yet.'),allowed_mentions=discord.AllowedMentions.none())


@group.command(name='profile',description='View your point and participation stats')
async def profile(interaction:discord.Interaction,player:discord.Member=None):
    player=player or interaction.user
    with connect() as db:
        pts=db.execute('SELECT points FROM scores WHERE guild_id=? AND user_id=?',(interaction.guild_id,player.id)).fetchone()
        count=db.execute('''SELECT COUNT(*) FROM entries e JOIN rounds r ON r.id=e.round_id
                         WHERE r.guild_id=? AND e.user_id=?''',(interaction.guild_id,player.id)).fetchone()[0]
        wins=db.execute('SELECT COUNT(*) FROM completed_results WHERE guild_id=? AND winner_id=?',
                        (interaction.guild_id,player.id)).fetchone()[0]
        received=db.execute('''SELECT COUNT(*) FROM votes v JOIN entries e ON e.id=v.entry_id
                              JOIN rounds r ON r.id=e.round_id WHERE r.guild_id=? AND e.user_id=?''',
                            (interaction.guild_id,player.id)).fetchone()[0]
        theme_count=db.execute("SELECT COUNT(*) FROM point_events WHERE guild_id=? AND user_id=? AND kind='on_theme'",
                                (interaction.guild_id,player.id)).fetchone()[0]
        suggestions=db.execute("SELECT COUNT(*) FROM theme_suggestions WHERE guild_id=? AND user_id=? AND status='approved'",
                               (interaction.guild_id,player.id)).fetchone()[0]
    embed=discord.Embed(title=f'🎤 Arena Profile — {player.display_name}',color=discord.Color.blurple())
    for label,value in [('Points',pts['points'] if pts else 0),('Entries',count),('Wins',wins),('Votes received',received),('On Theme awards',theme_count),('Approved themes',suggestions)]:
        embed.add_field(name=label,value=str(value))
    earned=[]
    if wins>=1:earned.append('🏆 First Blood')
    if count>=50:earned.append('✍️ Persistent Nuisance')
    if theme_count>=10:earned.append('🎭 Theme Master')
    if theme_count>=25:earned.append('🎨 Creative Genius')
    if theme_count>=50:earned.append('👑 Theme Legend')
    if suggestions>=1:earned.append('🌟 Theme Creator')
    if received>=100:earned.append('❤️ Crowd Favorite')
    embed.add_field(name='Achievements',value=', '.join(earned) or 'Play to unlock!',inline=False)
    await interaction.response.send_message(embed=embed,ephemeral=True)


class ChampionSelect(discord.ui.Select):
    def __init__(self,channel_id,slot,round_id,options):
        self.channel_id=channel_id;self.slot=slot;self.round_id=round_id
        super().__init__(placeholder='Choose the next theme',options=[discord.SelectOption(label=x[:100],value=str(i)) for i,x in enumerate(options)])
        self.options_list=options

    async def callback(self,interaction):
        with connect() as db:
            row=db.execute('SELECT winner_id FROM champion_choices WHERE round_id=?',(self.round_id,)).fetchone()
        if not row or row['winner_id']!=interaction.user.id:
            await interaction.response.send_message('This Champion Choice is not yours or has expired.',ephemeral=True);return
        await interaction.response.defer(ephemeral=True)
        ok=await finalize_champion(self.channel_id,self.slot,self.round_id,self.options_list[int(self.values[0])])
        await interaction.followup.send('✅ Your new theme was selected!' if ok else 'This selection has expired.',ephemeral=True)


class ChampionView(discord.ui.View):
    def __init__(self,channel_id,slot,round_id,options):
        super().__init__(timeout=300)
        self.add_item(ChampionSelect(channel_id,slot,round_id,options))


@group.command(name='champion',description='Winner: pick one of three themes for the next board')
async def champion(interaction:discord.Interaction,board:app_commands.Range[int,1,5]):
    with connect() as db:
        r=slot_row(db,interaction.channel_id,board)
        choice=db.execute('SELECT * FROM champion_choices WHERE round_id=?',(r['id'],)).fetchone() if r else None
    if not choice or choice['winner_id']!=interaction.user.id:
        await interaction.response.send_message('No pending Champion Choice for you on that board.',ephemeral=True);return
    await interaction.response.send_message('🏆 Choose the next theme for this board.',
        view=ChampionView(interaction.channel_id,board,r['id'],json.loads(choice['options_json'])),ephemeral=True)


@group.command(name='difficulty',description='Host: set letter difficulty for a future board refresh')
@app_commands.choices(level=[app_commands.Choice(name='Easy',value='easy'),
                             app_commands.Choice(name='Standard',value='standard'),
                             app_commands.Choice(name='Chaos',value='chaos')])
async def difficulty(interaction:discord.Interaction,board:app_commands.Range[int,1,5],level:app_commands.Choice[str]):
    if not await require_host(interaction):return
    with connect() as db:
        if not slot_row(db,interaction.channel_id,board):
            await interaction.response.send_message('Start the five boards first.',ephemeral=True);return
        db.execute('''INSERT INTO board_prefs(channel_id,slot,difficulty) VALUES(?,?,?)
            ON CONFLICT(channel_id,slot) DO UPDATE SET difficulty=excluded.difficulty''',
            (interaction.channel_id,board,level.value))
    await interaction.response.send_message(f'✅ Board {board} set to {level.name} for its NEXT acronym. Current entries unchanged.',ephemeral=True)


@group.command(name='classics',description='View the Hall of Fame and previous winning answers')
async def classics(interaction:discord.Interaction):
    with connect() as db:
        rows=db.execute('''SELECT * FROM board_history WHERE channel_id=? AND winner_id IS NOT NULL
                ORDER BY finished_at DESC LIMIT 8''',(interaction.channel_id,)).fetchall()
    body='\n'.join(f'🏆 <@{r["winner_id"]}> • **{" · ".join(r["letters"])}** — '
                   f'{discord.utils.escape_markdown(r["winning_answer"] or "")} '
                   f'({r["votes"]} votes){" 🎭 "+r["theme"] if r["theme"] else ""}' for r in rows)
    await interaction.response.send_message('📚 **HALL OF FAME**\n'+(body or 'No winners archived yet.'),ephemeral=True,
                                            allowed_mentions=discord.AllowedMentions.none())


@group.command(name='suggest_theme',description='Submit a new theme for Arena Host review')
async def suggest_theme(interaction:discord.Interaction,theme:app_commands.Range[str,8,100]):
    name=' '.join(theme.split())
    with connect() as db:
        exists=db.execute('SELECT 1 FROM theme_bank WHERE name=? COLLATE NOCASE',(name,)).fetchone()
        duplicate=db.execute('SELECT 1 FROM theme_suggestions WHERE guild_id=? AND name=? COLLATE NOCASE AND status=?',
                             (interaction.guild_id,name,'pending')).fetchone()
        if exists or duplicate:
            await interaction.response.send_message('This theme is already in the bank or pending review.',ephemeral=True);return
        db.execute('INSERT INTO theme_suggestions(guild_id,user_id,name,submitted_at) VALUES(?,?,?,?)',
                   (interaction.guild_id,interaction.user.id,name,int(time.time())))
    await interaction.response.send_message('✅ Theme suggested! An Arena Host can review it.',ephemeral=True)


@group.command(name='my_suggestions',description='View your proposed themes and approval status')
async def my_suggestions(interaction:discord.Interaction):
    with connect() as db:rows=db.execute('''SELECT * FROM theme_suggestions WHERE guild_id=? AND user_id=?
            ORDER BY id DESC LIMIT 15''',(interaction.guild_id,interaction.user.id)).fetchall()
    body='\n'.join(f'#{r["id"]} **{discord.utils.escape_markdown(r["name"])}** — {r["status"]}' for r in rows)
    await interaction.response.send_message(body or 'No suggestions yet.',ephemeral=True)


@group.command(name='theme_queue',description='Host: view pending community theme suggestions')
async def theme_queue(interaction:discord.Interaction):
    if not await require_host(interaction):return
    with connect() as db:rows=db.execute('''SELECT * FROM theme_suggestions WHERE guild_id=? AND status='pending'
            ORDER BY id LIMIT 15''',(interaction.guild_id,)).fetchall()
    body='\n'.join(f'#{r["id"]} {discord.utils.escape_markdown(r["name"])} — <@{r["user_id"]}>' for r in rows)
    await interaction.response.send_message(body or 'No pending suggestions.',ephemeral=True,
                                            allowed_mentions=discord.AllowedMentions.none())


@group.command(name='theme_approve',description='Host: approve a community theme suggestion')
async def theme_approve(interaction:discord.Interaction,suggestion_id:int):
    if not await require_host(interaction):return
    with connect() as db:
        row=db.execute("SELECT * FROM theme_suggestions WHERE id=? AND guild_id=? AND status='pending'",
                       (suggestion_id,interaction.guild_id)).fetchone()
        if row:
            db.execute("UPDATE theme_suggestions SET status='approved',reviewer_id=? WHERE id=?",(interaction.user.id,suggestion_id))
            db.execute('INSERT OR IGNORE INTO theme_bank(name,category,contributed_by,approved_at) VALUES(?,?,?,?)',
                       (row['name'],'Community',row['user_id'],int(time.time())))
    await interaction.response.send_message('✅ Theme approved.' if row else 'Suggestion not found or already reviewed.',ephemeral=True)


@group.command(name='theme_reject',description='Host: reject a community theme suggestion')
async def theme_reject(interaction:discord.Interaction,suggestion_id:int):
    if not await require_host(interaction):return
    with connect() as db:
        row=db.execute("SELECT * FROM theme_suggestions WHERE id=? AND guild_id=? AND status='pending'",
                       (suggestion_id,interaction.guild_id)).fetchone()
        if row:db.execute("UPDATE theme_suggestions SET status='rejected',reviewer_id=? WHERE id=?",(interaction.user.id,suggestion_id))
    await interaction.response.send_message('Theme rejected.' if row else 'Suggestion not found or already reviewed.',ephemeral=True)


@group.command(name='notifications',description='Opt in or out of private voting reminders')
async def notifications(interaction:discord.Interaction,enabled:bool):
    with connect() as db:
        db.execute('''INSERT INTO notification_prefs(guild_id,user_id,enabled) VALUES(?,?,?)
            ON CONFLICT(guild_id,user_id) DO UPDATE SET enabled=excluded.enabled''',
            (interaction.guild_id,interaction.user.id,int(enabled)))
    await interaction.response.send_message('🔔 Voting reminders '+('enabled' if enabled else 'disabled')+'.',ephemeral=True)


@group.command(name='host_add',description='Owner/admin: authorize an Arena Host')
async def host_add(interaction:discord.Interaction,member:discord.Member):
    if not admin(interaction):
        await interaction.response.send_message('Only bot owner, server owner or Manage Server admins can assign hosts.',ephemeral=True);return
    with connect() as db:
        db.execute('INSERT OR IGNORE INTO arena_hosts(guild_id,user_id) VALUES(?,?)',(interaction.guild_id,member.id))
    await interaction.response.send_message(f'✅ {member.display_name} is now an Arena Host.',ephemeral=True)


@group.command(name='host_remove',description='Owner/admin: revoke Arena Host access')
async def host_remove(interaction:discord.Interaction,member:discord.Member):
    if not admin(interaction):
        await interaction.response.send_message('Only bot owner, server owner or Manage Server admins can remove hosts.',ephemeral=True);return
    with connect() as db:db.execute('DELETE FROM arena_hosts WHERE guild_id=? AND user_id=?',(interaction.guild_id,member.id))
    await interaction.response.send_message(f'Host access removed: {member.display_name}.',ephemeral=True)


@bot.event
async def on_ready():
    print(f'✅ Acro Arena 3.2 vote-fix online: {bot.user} ({bot.user.id})')


@bot.event
async def setup_hook():
    bot.add_view(DashboardView())
    with connect() as db:
        rounds=db.execute('''SELECT r.id FROM arena_board_slots s
              JOIN rounds r ON r.id=s.round_id WHERE r.phase IN ('submitting','choice')''').fetchall()
    for row in rounds:schedule(row['id'])
    if GUILD_ID:
        guild=discord.Object(id=int(GUILD_ID))
        bot.tree.copy_global_to(guild=guild)
        await bot.tree.sync(guild=guild)
        print(f'Commands synced to server {GUILD_ID}')
    else:
        await bot.tree.sync()
        print('Global commands synced; propagation may take time')


bot.tree.add_command(group)

if __name__=='__main__':
    if not TOKEN or TOKEN=='PASTE_YOUR_BOT_TOKEN_HERE':
        raise SystemExit('Set DISCORD_TOKEN inside F:\\Acronym\\.env')
    init_db()
    bot.run(TOKEN)
