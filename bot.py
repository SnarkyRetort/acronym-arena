"""Acro Arena 3.5.0 unified dynamic challenge cards. Run: py bot.py (in F:\\Acronym)."""
import asyncio
import os
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from arena_core import Arena, MAX_SINGLES
from challenge_art import make_challenge_image

ROOT=Path(__file__).resolve().parent
load_dotenv(ROOT/'.env')
TOKEN=os.getenv('DISCORD_TOKEN','').strip()
GUILD_ID=os.getenv('GUILD_ID','').strip()
OWNER_ID=int(os.getenv('ARENA_OWNER_ID','0') or '0')
arena=Arena(ROOT/'acronym_game.sqlite3')
intents=discord.Intents.default()
bot=commands.Bot(command_prefix=commands.when_mentioned,intents=intents)
VERSION = '3.5.0'
group=app_commands.Group(name='acronym',description=f'Acro Arena {VERSION} — unified challenge cards')
channel_locks={}
GOLD=0xE9B84D
PURPLE=0x7651D5
BANNER=ROOT/'acro_arena_banner.jpg'
BANNER_NAME='acro_arena_banner.jpg'

ART_NAME='acro_challenge.png'
PLAYER_NAMES={}

async def challenge_file(rid):
    r=arena.get(rid)
    if not r:raise ValueError('Challenge not found')
    with arena.db() as db:
        entries=[dict(x) for x in db.execute('''SELECT e.*,
            (SELECT COUNT(*) FROM ac33_votes v WHERE v.entry_id=e.id AND v.rank=1) AS firsts,
            (SELECT COUNT(*) FROM ac33_votes v WHERE v.entry_id=e.id AND v.rank=2) AS seconds,
            (SELECT COUNT(*) FROM ac33_comments c WHERE c.entry_id=e.id) AS comments,
            (SELECT COUNT(*) FROM ac33_marks m WHERE m.entry_id=e.id) AS marks
            FROM ac33_entries e WHERE round_id=? ORDER BY e.id''',(rid,))]
    user_names={}
    for entry in entries:
        uid=entry['user_id']
        user=bot.get_user(uid)
        if user:PLAYER_NAMES[uid]=user.display_name
        elif uid not in PLAYER_NAMES:
            try:
                user=await bot.fetch_user(uid)
                PLAYER_NAMES[uid]=user.display_name
            except discord.HTTPException:
                PLAYER_NAMES[uid]=f'Player {uid % 10000:04d}'
        user_names[uid]=PLAYER_NAMES[uid]
    img=make_challenge_image(r,entries,arena.single_stats(rid),user_names,BANNER,VERSION)
    return discord.File(img,filename=ART_NAME)

async def send_premium(chan,rid):
    return await chan.send(view=SinglePostLayout(rid),file=await challenge_file(rid),
                           allowed_mentions=discord.AllowedMentions.none())

async def edit_premium(msg,rid):
    # Replace prior attachment; the image and controls stay in ONE Discord message.
    await msg.edit(content=None,embed=None,attachments=[await challenge_file(rid)],
                   view=SinglePostLayout(rid),
                   allowed_mentions=discord.AllowedMentions.none())


def lock(channel):return channel_locks.setdefault(channel,asyncio.Lock())
def esc(s):return discord.utils.escape_markdown(s).replace('@','@\u200b')
def label(r):return ' · '.join(r['letters'])
def is_host(i):
    if i.user.id==OWNER_ID or (i.guild and i.guild.owner_id==i.user.id):return True
    if isinstance(i.user,discord.Member):
        p=i.user.guild_permissions
        if p.administrator or p.manage_guild or p.manage_messages:return True
    with arena.db() as db:
        return bool(db.execute('SELECT 1 FROM ac33_hosts WHERE guild_id=? AND user_id=?',(i.guild_id,i.user.id)).fetchone() or
                    db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='arena_hosts'").fetchone() and
                    db.execute('SELECT 1 FROM arena_hosts WHERE guild_id=? AND user_id=?',(i.guild_id,i.user.id)).fetchone())

async def require_host(i):
    if is_host(i):return True
    await i.response.send_message('Arena Host permissions required.',ephemeral=True)
    return False

def dashboard(channel):
    rows=arena.active(channel)
    embed=discord.Embed(title=f'🎤 ACRO ARENA {VERSION} — CHALLENGES',
        description='Pick **one challenge** below. ✍️ Enter, 🏆 pick your favorite, 🥈 choose a runner-up, and 💬 riff on answers. '
                    'Each game lasts 24 hours. +1 entry, +5 On Theme, +25 win.',
        color=discord.Color.blurple())
    if not rows: embed.add_field(name='No live singles',value='An Arena Host can use `/acronym start`.',inline=False)
    with arena.db() as db:
        for r in rows:
            n=db.execute('SELECT COUNT(*) FROM ac33_entries WHERE round_id=?',(r['id'],)).fetchone()[0]
            v=db.execute('SELECT COUNT(*) FROM ac33_votes WHERE round_id=? AND rank=1',(r['id'],)).fetchone()[0]
            state=('🏆 Champion choosing next theme' if r['state']=='choice' else
                   f'🟢 Entries open • {max(0,2-n)} more needed for voting' if n<2 else '🗳️ Entries and voting open')
            end=r['choice_deadline'] if r['state']=='choice' else r['deadline']
            embed.add_field(name=f'CHALLENGE #{r["id"]} — {label(r)}',
                            value=f'{state}\n🎭 {esc(r["theme"])}\n'
                                  f'🤖 AI {"ON" if r["ai_allowed"] else "OFF"} (honor system)\n'
                                  f'👥 {n} entries • 🏆 {v} first-place picks\n'
                                  f'⏳ <t:{end}:R>' if end else state,inline=False)
    embed.set_footer(text='Start with one single. Up to 5 independent singles at a time.')
    return embed

async def update_dashboard(channel_id):
    # v3.5: no second public dashboard competing with unified challenge cards.
    with arena.db() as db:
        row=db.execute('SELECT dashboard_id FROM ac33_channels WHERE channel_id=?',(channel_id,)).fetchone()
    if row and row['dashboard_id']:
        try:
            channel=bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
            old=await channel.fetch_message(row['dashboard_id'])
            await old.delete()
        except discord.NotFound:pass
        except discord.HTTPException as exc:
            print(f'Legacy dashboard cleanup failed in {channel_id}: {exc}')
            return
        with arena.db() as db:
            db.execute('UPDATE ac33_channels SET dashboard_id=NULL WHERE channel_id=?',(channel_id,))


def challenge_summary(rid):
    r=arena.get(rid)
    stats=arena.single_stats(rid)
    if r['state']=='choice':
        state=f'🏆 Champion chooses the next challenge <t:{r["choice_deadline"]}:R>'
    elif r['state']=='done':state='🏁 Results saved'
    else:
        state=('🟢 Entries open' if stats['entries']<2 else '🗳️ Voting open')
        state+=f' · Closes <t:{r["deadline"]}:R>'
    return f'{state} · 🤖 AI {"ON" if r["ai_allowed"] else "OFF"} · v{VERSION}'

class SinglePostLayout(discord.ui.LayoutView):
    def __init__(self,rid):
        super().__init__(timeout=None)
        self.rid=rid
        r=arena.get(rid)
        group=discord.ui.Container(accent_colour=discord.Colour(PURPLE))
        group.add_item(discord.ui.MediaGallery(discord.MediaGalleryItem(
            'attachment://'+ART_NAME,description=f'Acro Arena Challenge #{rid}: player answers and scores')))
        group.add_item(discord.ui.TextDisplay(challenge_summary(rid)))
        row=discord.ui.ActionRow()
        for action,caption,emoji,style in [
            ('enter','Enter / Edit','✍️',discord.ButtonStyle.primary),
            ('votes','Vote','🏆',discord.ButtonStyle.success),
            ('comments','Discuss','💬',discord.ButtonStyle.secondary),
            ('leaderboard','Leaderboard','📊',discord.ButtonStyle.secondary),
            ('choice','Player’s Choice','🎲',discord.ButtonStyle.secondary),
        ]:
            button=discord.ui.Button(label=caption,emoji=emoji,style=style,
                                     custom_id=f'acro35:challenge:{action}:{rid}')
            async def handler(i,operation=action):
                current=arena.get(self.rid)
                if not current or current['channel_id']!=i.channel_id or current['state']=='done':
                    await i.response.send_message('That challenge is finished.',ephemeral=True);return
                if operation=='leaderboard':
                    leaders=arena.leaders(i.guild_id)
                    await i.response.send_message('🏆 **LEADERBOARD**\n'+('\n'.join(
                        f'{n}. <@{x["user_id"]}> — {x["points"]}' for n,x in enumerate(leaders,1)) or 'No scores yet.'),
                        ephemeral=True,allowed_mentions=discord.AllowedMentions.none())
                    return
                if operation=='choice':
                    if current['state']!='choice' or current['winner_id']!=i.user.id:
                        await i.response.send_message('Player’s Choice unlocks for the winner after results.',ephemeral=True);return
                    await i.response.send_message('🏆 Choose the next challenge theme or Auto Select.',
                        view=ThemeView(i.user.id,arena.champion_options(self.rid),self.rid,bool(current['ai_allowed'])),
                        ephemeral=True)
                    return
                if current['state']!='open':
                    await i.response.send_message('This challenge is awaiting Player’s Choice.',ephemeral=True);return
                details=SingleView(self.rid)
                await getattr(details,operation).callback(i)
            button.callback=handler
            row.add_item(button)
        group.add_item(row)
        self.add_item(group)


async def ensure_single_post(rid):
    r = arena.get(rid)
    if not r:return False
    if r['state']=='done':
        old=arena.single_post(rid)
        if old:
            try:
                channel=bot.get_channel(old['channel_id']) or await bot.fetch_channel(old['channel_id'])
                msg=await channel.fetch_message(old['message_id'])
                await msg.delete()
            except discord.NotFound:pass
            except discord.HTTPException as e:
                print(f'Unable to remove finished Challenge #{rid}: {e}')
                return False
        return True
    try:
        channel = bot.get_channel(r['channel_id']) or await bot.fetch_channel(r['channel_id'])
        recorded = arena.single_post(rid)
        if recorded:
            try:
                message = await channel.fetch_message(recorded['message_id'])
                await edit_premium(message, rid)
                return True
            except discord.NotFound:
                pass  # Someone deleted the old post; recreate the one persistent card.
        # Finished older rounds don't need new posts. Existing 3.3/3.4 live rounds do.
        if r['state'] == 'done' and not recorded:
            return True
        message = await send_premium(channel, rid)
        arena.record_single_post(rid, r['channel_id'], message.id)
        bot.add_view(SinglePostLayout(rid), message_id=message.id)
        return True
    except discord.HTTPException as error:
        print(f'Single post failed for round {rid} in channel {r["channel_id"]}: {error}')
        return False


async def announce(channel_id,text):
    try:
        chan=bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
        await chan.send(text,allowed_mentions=discord.AllowedMentions.none())
    except discord.HTTPException as e:print(f'Announcement failed: {e}')

# v3.5: answers now belong to the unified challenge card. No separate answer posts.
async def refresh_entry_card(entry_id):
    entry=arena.entry(entry_id)
    if entry:await ensure_single_post(entry['round_id'])

async def ensure_entry_card(entry_id):
    return await refresh_entry_card(entry_id)

class ThemeCustom(discord.ui.Modal,title='Make up a theme'):
    theme=discord.ui.TextInput(label='Your funny theme',placeholder='Things a spaceship AI should never say',min_length=3,max_length=100)
    def __init__(self,caller,choice_round=None,ai_on=False):
        super().__init__();self.caller=caller;self.choice_round=choice_round;self.ai_on=ai_on
    async def on_submit(self,i):
        if i.user.id!=self.caller:
            await i.response.send_message('That menu belongs to someone else.',ephemeral=True);return
        await perform_theme(i,str(self.theme),self.choice_round,self.ai_on)

async def perform_theme(i,theme,choice_round=None,ai_on=False):
    async with lock(i.channel_id):
        try:
            if choice_round is None:
                if not is_host(i):raise ValueError('Only an Arena Host can start a single.')
                rid=arena.start(i.guild_id,i.channel_id,theme,ai_on)
                msg=f'✅ Challenge #{rid} started: **{label(arena.get(rid))}** • **{esc(theme)}** • AI {"ON" if ai_on else "OFF"}.'
            else:
                rid,selected=arena.champion(choice_round,i.user.id,theme,ai_on)
                msg=f'🏆 Champion selected **{esc(selected)}**. New Challenge #{rid}: **{label(arena.get(rid))}**.'
        except ValueError as e:
            await i.response.send_message(str(e),ephemeral=True);return
    await i.response.send_message(msg,ephemeral=True)
    # v3.5: no duplicate announcement; the unified challenge post is the announcement.
    await update_dashboard(i.channel_id)
    if choice_round is not None:
        await ensure_single_post(choice_round)
    await ensure_single_post(rid)

class ThemeSelect(discord.ui.Select):
    def __init__(self,options,caller,choice_round,ai_on):
        self.caller=caller;self.choice_round=choice_round;self.ai_on=ai_on
        super().__init__(placeholder='Choose a funny theme',options=[discord.SelectOption(label=x[:100],value=str(j)) for j,x in enumerate(options)])
        self.themes=options
    async def callback(self,i):
        if i.user.id!=self.caller:
            await i.response.send_message('Not your theme menu.',ephemeral=True);return
        await perform_theme(i,self.themes[int(self.values[0])],self.choice_round,self.ai_on)

class ThemeView(discord.ui.View):
    def __init__(self,caller,options,choice_round=None,ai_on=False):
        super().__init__(timeout=900)
        self.caller=caller;self.choice_round=choice_round;self.ai_on=ai_on
        self.theme_options=list(options)
        self.add_item(ThemeSelect(options,caller,choice_round,ai_on))
    @discord.ui.button(label='Other / Make one up',emoji='✍️',style=discord.ButtonStyle.secondary)
    async def custom(self,i,b):
        if i.user.id!=self.caller:
            await i.response.send_message('Not your menu.',ephemeral=True);return
        await i.response.send_modal(ThemeCustom(self.caller,self.choice_round,self.ai_on))
    @discord.ui.button(label='Auto Select',emoji='🎲',style=discord.ButtonStyle.secondary)
    async def auto(self,i,b):
        if i.user.id!=self.caller:
            await i.response.send_message('Not your menu.',ephemeral=True);return
        await perform_theme(i,arena.rng.choice(self.theme_options),self.choice_round,self.ai_on)

class AnswerModal(discord.ui.Modal,title='Submit / edit your acronym'):
    phrase=discord.ui.TextInput(label='Your answer',max_length=200,placeholder='One word per letter, in order')
    def __init__(self,rid,user_id,entry_id=None):
        super().__init__(timeout=300);self.rid=rid;self.entry_id=entry_id
        r=arena.get(rid)
        self.title=f'🎭 {r["theme"]}'[:45]
        self.phrase.label=f'Expand {label(r)}'
        previous=next((e for e in arena.entries(rid) if e['user_id']==user_id),None)
        if previous:self.phrase.default=previous['answer'][:200]
    async def on_submit(self,i):
        async with lock(i.channel_id):
            try:earned=arena.enter(self.rid,i.user.id,str(self.phrase))
            except ValueError as e:
                await i.response.send_message(str(e),ephemeral=True);return
        entry=next(e for e in arena.entries(self.rid) if e['user_id']==i.user.id)
        await i.response.send_message('✅ Saved! '+('+1 participation point.' if earned else 'Your entry was updated.')+' The challenge card is refreshing.',ephemeral=True)
        await update_dashboard(i.channel_id)
        await ensure_single_post(self.rid)

class CommentModal(discord.ui.Modal,title='Riff on an answer'):
    message=discord.ui.TextInput(label='Your joke / reply',style=discord.TextStyle.paragraph,max_length=250)
    def __init__(self,rid,eid,number):
        super().__init__();self.rid=rid;self.eid=eid;self.number=number
    async def on_submit(self,i):
        async with lock(i.channel_id):
            try:earned=arena.comment(self.rid,self.eid,i.user.id,str(self.message))
            except ValueError as e:
                await i.response.send_message(str(e),ephemeral=True);return
        await i.response.send_message('✅ Comment posted. '+('+1 banter point.' if earned else 'You reached the 3-point reply cap.'),ephemeral=True)
        await ensure_single_post(self.rid)

class AnswerSelect(discord.ui.Select):
    def __init__(self,rid,kind,rank=None):
        self.rid=rid;self.kind=kind;self.rank=rank
        entries=arena.entries(rid)
        super().__init__(placeholder={'vote':'🏆 Pick favorite' if rank==1 else '🥈 Pick runner-up','mark':'🎭 On Theme','comment':'💬 Comment on an answer'}[kind],
            options=[discord.SelectOption(label=f'Answer {n}',value=str(e['id']),description=e['answer'][:90]) for n,e in enumerate(entries,1)])
    async def callback(self,i):
        eid=int(self.values[0]); entries=arena.entries(self.rid)
        async with lock(i.channel_id):
            try:
                if self.kind=='vote':
                    arena.vote(self.rid,i.user.id,self.rank,eid)
                    msg=f'✅ {"🏆 FIRST" if self.rank==1 else "🥈 SECOND"} choice **RECORDED**.'
                elif self.kind=='mark':
                    added=arena.marks(self.rid,i.user.id,eid)
                    msg='✅ On Theme endorsement '+('added.' if added else 'removed.')
                else:
                    number=next(j for j,e in enumerate(entries,1) if e['id']==eid)
                    await i.response.send_modal(CommentModal(self.rid,eid,number));return
            except ValueError as e:
                await i.response.send_message(str(e),ephemeral=True);return
        await i.response.send_message(msg,ephemeral=True)
        await update_dashboard(i.channel_id)
        await ensure_single_post(self.rid)

class AnswersView(discord.ui.View):
    def __init__(self,rid,comments_only=False):
        super().__init__(timeout=300)
        entries=arena.entries(rid)
        if entries:
            if not comments_only and len(entries)>=2:
                self.add_item(AnswerSelect(rid,'vote',1))
                self.add_item(AnswerSelect(rid,'vote',2))
                self.add_item(AnswerSelect(rid,'mark'))
            self.add_item(AnswerSelect(rid,'comment'))

class SingleView(discord.ui.View):
    def __init__(self,rid):
        super().__init__(timeout=300);self.rid=rid
    @discord.ui.button(label='Enter / Edit',emoji='✍️',style=discord.ButtonStyle.primary)
    async def enter(self,i,b):
        r=arena.get(self.rid)
        if r['state']!='open':
            await i.response.send_message('This round is not accepting entries.',ephemeral=True);return
        await i.response.send_modal(AnswerModal(self.rid,i.user.id))
    @discord.ui.button(label='Vote / Updoots',emoji='🏆',style=discord.ButtonStyle.success)
    async def votes(self,i,b):
        entries=arena.entries(self.rid)
        if len(entries)<2:
            await i.response.send_message('Voting opens when two people enter.',ephemeral=True);return
        if arena.get(self.rid)['state']!='open':
            await i.response.send_message('Voting has closed.',ephemeral=True);return
        with arena.db() as db:
            picks=db.execute('SELECT rank,entry_id FROM ac33_votes WHERE round_id=? AND voter_id=?',(self.rid,i.user.id)).fetchall()
        saved={p['rank']:p['entry_id'] for p in picks}
        lines=[f'**{n}.** {esc(e["answer"])}' for n,e in enumerate(entries,1)]
        await i.response.send_message('🏆 **FIRST = 3**, 🥈 **SECOND = 1**. You can change your picks. No self-voting.\n'
            + '\n'.join(lines)+'\n\n'+f'Your saved picks: first {saved.get(1,"—")}, second {saved.get(2,"—")} (answer IDs).',
            view=AnswersView(self.rid),ephemeral=True)
    @discord.ui.button(label='See answers',emoji='📇',style=discord.ButtonStyle.secondary)
    async def see_cards(self,i,b):
        entries=arena.entries(self.rid)
        if not entries:
            await i.response.send_message('No answers yet.',ephemeral=True);return
        await i.response.send_message('\n'.join(f'**{n}.** {esc(e["answer"])}' for n,e in enumerate(entries,1)),ephemeral=True)

    @discord.ui.button(label='Jokes / Comments',emoji='💬',style=discord.ButtonStyle.secondary)
    async def comments(self,i,b):
        entries=arena.entries(self.rid)
        if not entries:
            await i.response.send_message('No answers to comment on yet.',ephemeral=True);return
        with arena.db() as db:
            latest=db.execute('SELECT user_id,entry_id,content FROM ac33_comments WHERE round_id=? ORDER BY id DESC LIMIT 8',(self.rid,)).fetchall()
        comments='\n'.join(f'💬 <@{c["user_id"]}> on answer #{c["entry_id"]}: {esc(c["content"])}' for c in reversed(latest))
        answer_list='\n'.join(f'**{n}.** {esc(e["answer"])}' for n,e in enumerate(entries,1))
        await i.response.send_message('**PLAYER ANSWERS**\n'+answer_list+'\n\n**RECENT COMMENTS**\n'+(comments or 'No comments yet.')+'\n\nChoose an answer below to reply.',
                                      view=AnswersView(self.rid,True),ephemeral=True,allowed_mentions=discord.AllowedMentions.none())

class SingleSelect(discord.ui.Select):
    def __init__(self,rows):
        super().__init__(placeholder='Select a challenge to play',custom_id='acro33:single',options=[
            discord.SelectOption(label=f'Challenge #{r["id"]}: {r["letters"]}',value=str(r['id']),description=r['theme'][:85]) for r in rows])
    async def callback(self,i):
        rid=int(self.values[0]);r=arena.get(rid)
        if not r or r['channel_id']!=i.channel_id or r['state']=='done':
            await i.response.send_message('That single has ended. Open the dashboard again.',ephemeral=True);return
        if r['state']=='choice':
            await i.response.send_message('🏆 Waiting for the champion to pick the next theme.',ephemeral=True);return
        await i.response.send_message(f'**CHALLENGE #{r["id"]} — {label(r)}**\n🎭 {esc(r["theme"])}\n🤖 AI {"ON" if r["ai_allowed"] else "OFF"}\n<t:{r["deadline"]}:R>',view=SingleView(rid),ephemeral=True)

class DashboardView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        # Persistent dashboard buttons refresh from DB; no stale cached dropdown options.
    @discord.ui.button(label='Play a single',emoji='🎮',style=discord.ButtonStyle.primary,custom_id='acro33:play')
    async def play(self,i,b):
        rows=arena.active(i.channel_id)
        if not rows:
            await i.response.send_message('No singles live yet.',ephemeral=True);return
        view=discord.ui.View(timeout=300);view.add_item(SingleSelect(rows))
        await i.response.send_message('Choose the single you want:',view=view,ephemeral=True)
    @discord.ui.button(label='Scores',emoji='🏆',style=discord.ButtonStyle.secondary,custom_id='acro33:scores')
    async def scores(self,i,b):
        ranks=arena.leaders(i.guild_id)
        await i.response.send_message('🏆 **LEADERBOARD**\n'+('\n'.join(f'{j}. <@{r["user_id"]}> — {r["points"]}' for j,r in enumerate(ranks,1)) or 'No scores yet.'),ephemeral=True,allowed_mentions=discord.AllowedMentions.none())
    @discord.ui.button(label='Help',emoji='❓',style=discord.ButtonStyle.secondary,custom_id='acro33:help')
    async def help(self,i,b):
        await i.response.send_message(HELP,ephemeral=True)

HELP=(f'**ACRO ARENA {VERSION}**\n'
      'One challenge = one updating card. Tap Enter/Edit to submit (+1).\n'
      'After 2 players enter, tap Vote for 🏆 first (3) and 🥈 second (1). No self-voting.\n'
      'Discuss opens an answer chooser, then a comment form (first 3 replies earn +1).\n'
      'On Theme endorsements add +5. Unique winner gets +25 and Player’s Choice.\n'
      'Finished challenge messages leave the channel; scores and replies stay saved.\n'
      'AI ON/OFF is an honor system. Hosts use `/acronym start` and `/acronym finish`.')

@group.command(name='start',description='Host: launch one 24-hour challenge (up to five)')
async def start(i:discord.Interaction,ai_allowed:bool=False):
    if not await require_host(i):return
    if len(arena.active(i.channel_id))>=MAX_SINGLES:
        await i.response.send_message('Five singles are already running.',ephemeral=True);return
    await i.response.send_message(f'New single • **AI {"ON" if ai_allowed else "OFF"}**. Pick one of four funny themes or invent your own.',
                                  view=ThemeView(i.user.id,arena.choices(4),ai_on=ai_allowed),ephemeral=True)

@group.command(name='boards',description='View active challenges and play')
async def boards(i:discord.Interaction):
    await i.response.send_message(embed=dashboard(i.channel_id),view=DashboardView(),ephemeral=True)

@group.command(name='help',description='How to enter, vote, banter and win')
async def help_cmd(i:discord.Interaction):
    await i.response.send_message(HELP,ephemeral=True)

@group.command(name='leaderboard',description='All-time points, including existing 3.2 scores')
async def leaderboard(i:discord.Interaction):
    ranks=arena.leaders(i.guild_id)
    await i.response.send_message('🏆 **LEADERBOARD**\n'+('\n'.join(f'{j}. <@{r["user_id"]}> — {r["points"]}' for j,r in enumerate(ranks,1)) or 'No scores yet.'),ephemeral=True,allowed_mentions=discord.AllowedMentions.none())

@group.command(name='champion',description='Winner: choose next theme or let the bot choose')
async def champion(i:discord.Interaction,board:app_commands.Range[int,1,5]):
    row=next((r for r in arena.active(i.channel_id) if r['slot']==board),None)
    if not row or row['state']!='choice' or row['winner_id']!=i.user.id:
        await i.response.send_message('No Champion Choice for you in that single.',ephemeral=True);return
    await i.response.send_message('🏆 Choose the next theme, make one up, or Auto Select.',
        view=ThemeView(i.user.id,arena.champion_options(row['id']),row['id'],bool(row['ai_allowed'])),ephemeral=True)

@group.command(name='finish',description='Host: finish a challenge early, award points and announce winner')
async def finish(i:discord.Interaction,board:app_commands.Range[int,1,5]):
    if not await require_host(i):return
    row=next((r for r in arena.active(i.channel_id) if r['slot']==board and r['state']=='open'),None)
    if not row:
        await i.response.send_message('No open single in that slot.',ephemeral=True);return
    await i.response.defer(ephemeral=True)
    async with lock(i.channel_id): result=arena.finish(row['id'])
    await show_result(result)
    await i.followup.send('✅ Challenge results recorded.',ephemeral=True)

@group.command(name='host_add',description='Admin: grant another player Arena Host access')
async def host_add(i:discord.Interaction,member:discord.Member):
    if not (i.user.id==OWNER_ID or i.guild.owner_id==i.user.id or i.user.guild_permissions.manage_guild):
        await i.response.send_message('Server admin only.',ephemeral=True);return
    with arena.db() as db:db.execute('INSERT OR IGNORE INTO ac33_hosts VALUES(?,?)',(i.guild_id,member.id))
    await i.response.send_message(f'✅ {esc(member.display_name)} is an Arena Host.',ephemeral=True)

async def show_result(result):
    if not result:return
    lines=[f'**{p} points** — {esc(answer)} (<@{uid}>)' for uid,answer,p in result['scores']]
    if result['winner']:
        ending=f'🏆 Winner: <@{result["winner"]}> earns +25. Tap Player’s Choice on Challenge #{result["id"]} within one hour.'
    else:
        ending='🤝 Tie or no votes — no winner bonus. This challenge has ended; a host can launch another.'
    await announce(result['channel'],f'🎉 **CHALLENGE #{result["id"]} RESULTS**\n'+('\n'.join(lines) or 'No entries.')+'\n'+ending)
    await update_dashboard(result['channel'])
    await ensure_single_post(result['id'])

async def timer_loop():
    await bot.wait_until_ready()
    while not bot.is_closed():
        for rid,state in arena.due():
            row=arena.get(rid)
            async with lock(row['channel_id']):
                try:
                    if state=='open':
                        result=arena.finish(rid)
                        if result:await show_result(result)
                    elif state=='choice':
                        new_id,theme=arena.champion(rid,0,automatic=True)
                        await announce(row['channel_id'],f'🎲 Champion timeout: Auto Select chose **{esc(theme)}** for Challenge #{new_id} — {label(arena.get(new_id))}.')
                        await update_dashboard(row['channel_id'])
                        await ensure_single_post(rid)
                        await ensure_single_post(new_id)
                except Exception as exc:print(f'Timer {rid} failed: {exc!r}')
        await asyncio.sleep(20)

async def cleanup_legacy_cards():
    removed=0;failed=0
    for card in arena.cards():
        # If a game's new unified post failed, don't touch its old cards.
        round_row=arena.get(card['round_id'])
        if round_row and round_row['state']!='done' and not arena.single_post(card['round_id']):
            continue
        try:
            channel=bot.get_channel(card['channel_id']) or await bot.fetch_channel(card['channel_id'])
            msg=await channel.fetch_message(card['message_id'])
            await msg.delete()
            removed+=1
        except discord.NotFound:pass
        except discord.HTTPException as exc:
            failed+=1;print(f'Legacy answer cleanup failed #{card["entry_id"]}: {exc}')
    print(f'v{VERSION} migration: {removed} old answer posts removed; {failed} removal failures; historical replies remain in database')

@bot.event
async def setup_hook():
    bot.add_view(DashboardView())
    for post in arena.single_posts():
        row=arena.get(post['round_id'])
        if row and row['state']!='done':bot.add_view(SinglePostLayout(post['round_id']),message_id=post['message_id'])
    if GUILD_ID:
        guild=discord.Object(id=int(GUILD_ID))
        bot.tree.copy_global_to(guild=guild)
        await bot.tree.sync(guild=guild)
        print('Commands synced for guild',GUILD_ID)
    else:
        await bot.tree.sync()
        print('Global commands synced')
    asyncio.create_task(timer_loop())

@bot.event
async def on_ready():
    print(f'✅ Acro Arena {VERSION} online: {bot.user}')
    with arena.db() as db:channels=[r['channel_id'] for r in db.execute('SELECT channel_id FROM ac33_channels')]
    for cid in channels:await update_dashboard(cid)
    # Report actual refresh successes and failures, never assume all cards updated.
    ok=0; failed=0
    for cid in channels:
        for row in arena.active(cid):
            if await ensure_single_post(row['id']):ok+=1
            else:failed+=1
    print(f'Acro Arena v{VERSION}: {ok} of {ok+failed} active challenge cards updated; {failed} failed')
    if failed==0:await cleanup_legacy_cards()
    # Finished posts disappear after their results have been recorded.
    for post in arena.single_posts():
        row=arena.get(post['round_id'])
        if row and row['state']=='done':await ensure_single_post(row['id'])

bot.tree.add_command(group)
if __name__=='__main__':
    if not TOKEN:raise SystemExit('Missing DISCORD_TOKEN in .env')
    bot.run(TOKEN)