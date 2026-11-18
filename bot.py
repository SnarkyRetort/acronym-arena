"""Acro Arena 3.4.1 premium visual update. Run: py bot.py (in F:\\Acronym)."""
import asyncio
import os
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from arena_core import Arena, MAX_SINGLES

ROOT=Path(__file__).resolve().parent
load_dotenv(ROOT/'.env')
TOKEN=os.getenv('DISCORD_TOKEN','').strip()
GUILD_ID=os.getenv('GUILD_ID','').strip()
OWNER_ID=int(os.getenv('ARENA_OWNER_ID','0') or '0')
arena=Arena(ROOT/'acronym_game.sqlite3')
intents=discord.Intents.default()
bot=commands.Bot(command_prefix=commands.when_mentioned,intents=intents)
VERSION = '3.4.1'
group=app_commands.Group(name='acronym',description=f'Acro Arena {VERSION} — persistent entry cards')
channel_locks={}
GOLD=0xE9B84D
PURPLE=0x7651D5
BANNER=ROOT/'acro_arena_banner.jpg'
BANNER_NAME='acro_arena_banner.jpg'

def banner_file():
    return discord.File(str(BANNER), filename=BANNER_NAME)

async def send_premium(chan, embed, view):
    return await chan.send(embed=embed, view=view, file=banner_file(),
                           allowed_mentions=discord.AllowedMentions.none())

async def edit_premium(msg, embed, view):
    # Existing 3.4 posts get a banner in place. Later edits reuse the attachment,
    # preserving the same message ID, buttons, and message discussion history.
    present=any(a.filename==BANNER_NAME for a in msg.attachments)
    if present:
        await msg.edit(embed=embed, view=view,
                       allowed_mentions=discord.AllowedMentions.none())
    else:
        await msg.edit(embed=embed, view=view,
                       attachments=list(msg.attachments)+[banner_file()],
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
    embed=discord.Embed(title=f'🎤 ACRO ARENA {VERSION} — SINGLES',
        description='Pick **one single** below. ✍️ Enter, 🏆 pick your favorite, 🥈 choose a runner-up, and 💬 riff on answers. '
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
            embed.add_field(name=f'SINGLE {r["slot"]} — {label(r)}',
                            value=f'{state}\n🎭 {esc(r["theme"])}\n'
                                  f'🤖 AI {"ON" if r["ai_allowed"] else "OFF"} (honor system)\n'
                                  f'👥 {n} entries • 🏆 {v} first-place picks\n'
                                  f'⏳ <t:{end}:R>' if end else state,inline=False)
    embed.set_footer(text='Start with one single. Up to 5 independent singles at a time.')
    return embed

async def update_dashboard(channel_id):
    with arena.db() as db:
        row=db.execute('SELECT dashboard_id FROM ac33_channels WHERE channel_id=?',(channel_id,)).fetchone()
    if not row:return
    try:
        chan=bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
        if row['dashboard_id']:
            try:
                msg=await chan.fetch_message(row['dashboard_id'])
                await msg.edit(embed=dashboard(channel_id),view=DashboardView(),allowed_mentions=discord.AllowedMentions.none())
                return
            except (discord.NotFound,discord.Forbidden):pass
        msg=await chan.send(embed=dashboard(channel_id),view=DashboardView(),allowed_mentions=discord.AllowedMentions.none())
        with arena.db() as db:db.execute('UPDATE ac33_channels SET dashboard_id=? WHERE channel_id=?',(msg.id,channel_id))
    except discord.HTTPException as e:print(f'Dashboard error in {channel_id}: {e}')

def single_post_embed(rid):
    r=arena.get(rid)
    if not r:return None
    stats=arena.single_stats(rid)
    if r['state']=='choice':
        state='🏆 CHAMPION’S CHOICE'
        timing=f'<t:{r["choice_deadline"]}:R>' if r['choice_deadline'] else '—'
    elif r['state']=='done':
        state='🏁 ROUND COMPLETE';timing='Closed'
    else:
        state=(f'🟢 ENTRIES OPEN · {2-stats["entries"]} more to unlock voting'
               if stats['entries']<2 else '🗳️ ENTRIES & VOTING OPEN')
        timing=f'<t:{r["deadline"]}:R>' if r['deadline'] else '—'
    em=discord.Embed(
        title=f'✦  ACRO ARENA  /  SINGLE {r["slot"]:02d}',
        description=f'### {label(r)}\n**🎭 {esc(r["theme"])}**\n\n{state}',
        color=PURPLE)
    em.set_image(url='attachment://'+BANNER_NAME)
    em.add_field(name='👥 ENTRIES',value=f'**{stats["entries"]}**',inline=True)
    em.add_field(name='🏆 FIRST',value=f'**{stats["firsts"]}**',inline=True)
    em.add_field(name='🥈 SECOND',value=f'**{stats["seconds"]}**',inline=True)
    em.add_field(name='⏳ CLOSES',value=timing,inline=True)
    em.add_field(name='🤖 AI RULE',value='ON · encouraged' if r['ai_allowed'] else 'OFF · honor system',inline=True)
    em.add_field(name='✍️ PLAY',value='Use the buttons below',inline=True)
    em.set_footer(text='One single · one persistent post · answers have their own discussion threads')
    return em


class SinglePostView(discord.ui.View):
    def __init__(self, rid):
        super().__init__(timeout=None)
        self.rid = rid
        for action, caption, emoji, style in [
            ('enter', 'Enter / Edit', '✍️', discord.ButtonStyle.primary),
            ('votes', 'Vote / Updoots', '🏆', discord.ButtonStyle.success),
            ('see_cards', 'Answer Cards', '📇', discord.ButtonStyle.secondary),
            ('comments', 'Comments', '💬', discord.ButtonStyle.secondary),
        ]:
            button = discord.ui.Button(label=caption, emoji=emoji, style=style,
                                       custom_id=f'acro34:single:{action}:{rid}')
            async def handler(i, operation=action):
                r = arena.get(self.rid)
                if not r or r['channel_id'] != i.channel_id:
                    await i.response.send_message('This single is not available in this channel.',ephemeral=True)
                    return
                detail = SingleView(self.rid)
                await getattr(detail, operation).callback(i)
            button.callback = handler
            self.add_item(button)


async def ensure_single_post(rid):
    r = arena.get(rid)
    if not r:
        return
    try:
        channel = bot.get_channel(r['channel_id']) or await bot.fetch_channel(r['channel_id'])
        recorded = arena.single_post(rid)
        if recorded:
            try:
                message = await channel.fetch_message(recorded['message_id'])
                await edit_premium(message, single_post_embed(rid), SinglePostView(rid))
                return
            except discord.NotFound:
                pass  # Someone deleted the old post; recreate the one persistent card.
        # Finished older rounds don't need new posts. Existing 3.3/3.4 live rounds do.
        if r['state'] == 'done' and not recorded:
            return
        message = await send_premium(channel, single_post_embed(rid), SinglePostView(rid))
        arena.record_single_post(rid, r['channel_id'], message.id)
        bot.add_view(SinglePostView(rid), message_id=message.id)
    except discord.HTTPException as error:
        print(f'Single post failed for round {rid} in channel {r["channel_id"]}: {error}')


async def announce(channel_id,text):
    try:
        chan=bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
        await chan.send(text,allowed_mentions=discord.AllowedMentions.none())
    except discord.HTTPException as e:print(f'Announcement failed: {e}')

def card_embed(entry_id):
    data=arena.card_stats(entry_id)
    if not data:return None
    e=data['entry'];r=arena.get(e['round_id'])
    is_open=r['state']=='open'
    state='🟢 LIVE' if is_open else '🏁 FINAL RESULT'
    em=discord.Embed(
        title=f'✦  SINGLE {r["slot"]:02d}  /  ENTRY {entry_id:02d}   ·   {state}',
        description=(f'**{label(r)}**\n\n'
                     f'## {esc(e["answer"])}\n'
                     f'*by <@{e["user_id"]}>*\n\n'
                     f'🎭 **Theme** · {esc(r["theme"])}'),
        color=PURPLE if is_open else GOLD)
    em.add_field(name='🏆 FIRST',value=f'**{data["firsts"]}**',inline=True)
    em.add_field(name='🥈 SECOND',value=f'**{data["seconds"]}**',inline=True)
    em.add_field(name='✦ VOTE POINTS',value=f'**{data["score"]}**',inline=True)
    em.add_field(name='💬 DISCUSSION',value=f'{data["comments"]} replies',inline=True)
    em.add_field(name='🎭 ON THEME',value=str(data['marks']),inline=True)
    em.add_field(name='🤖 AI',value='ON' if r['ai_allowed'] else 'OFF',inline=True)
    em.set_footer(text=(f'Acro Arena · Entry #{entry_id} · '
        + ('Vote after two entries · comment below' if is_open else 'Voting closed · discussion remains open')))
    return em

class CardCommentModal(discord.ui.Modal,title='Comment on this answer'):
    message=discord.ui.TextInput(label='Your joke / reply',style=discord.TextStyle.paragraph,max_length=250)
    def __init__(self,entry_id):
        super().__init__();self.entry_id=entry_id
    async def on_submit(self,i):
        entry=arena.entry(self.entry_id)
        if not entry:
            await i.response.send_message('Entry not found.',ephemeral=True);return
        async with lock(i.channel_id):
            try:earned=arena.comment(entry['round_id'],self.entry_id,i.user.id,str(self.message))
            except ValueError as e:
                await i.response.send_message(str(e),ephemeral=True);return
        card=arena.card(self.entry_id)
        if card and card['thread_id']:
            try:
                thread=bot.get_channel(card['thread_id']) or await bot.fetch_channel(card['thread_id'])
                await thread.send(f'💬 <@{i.user.id}>: {esc(str(self.message))}',allowed_mentions=discord.AllowedMentions.none())
            except discord.HTTPException as e:
                print(f'Card thread comment failed: {e}')
                await i.response.send_message('Comment saved, but Discord could not post it to the thread. Check thread permissions.',ephemeral=True)
                await refresh_entry_card(self.entry_id)
                return
        await i.response.send_message('✅ Reply saved on this card.'+(' +1 banter point.' if earned else ''),ephemeral=True)
        await refresh_entry_card(self.entry_id)
        await ensure_single_post(entry['round_id'])

class CardView(discord.ui.View):
    def __init__(self,entry_id,thread_id=None):
        super().__init__(timeout=None)
        self.entry_id=entry_id
        for rank,emoji,title in [(1,'🏆','First choice'),(2,'🥈','Second choice')]:
            button=discord.ui.Button(label=title,emoji=emoji,style=discord.ButtonStyle.secondary,
                                     custom_id=f'acro34:vote:{rank}:{entry_id}',row=0)
            async def choose(i,r=rank):
                e=arena.entry(self.entry_id)
                if not e:
                    await i.response.send_message('Entry no longer available.',ephemeral=True);return
                async with lock(i.channel_id):
                    try:arena.vote(e['round_id'],i.user.id,r,self.entry_id)
                    except ValueError as ex:
                        await i.response.send_message(str(ex),ephemeral=True);return
                await i.response.send_message(f'✅ {"First" if r==1 else "Second"}-place updoot saved for this entry.',ephemeral=True)
                await refresh_entry_card(self.entry_id)
                await ensure_single_post(e['round_id'])
            button.callback=choose
            self.add_item(button)
        comment=discord.ui.Button(label='Comment',emoji='💬',style=discord.ButtonStyle.primary,
                                  custom_id=f'acro34:comment:{entry_id}',row=0)
        async def reply(i):
            await i.response.send_modal(CardCommentModal(self.entry_id))
        comment.callback=reply;self.add_item(comment)
        edit=discord.ui.Button(label='Edit my answer',emoji='✍️',style=discord.ButtonStyle.secondary,
                               custom_id=f'acro34:edit:{entry_id}',row=1)
        async def edit_answer(i):
            e=arena.entry(self.entry_id)
            if not e or e['user_id']!=i.user.id:
                await i.response.send_message('Only the entry author can edit this answer.',ephemeral=True);return
            r=arena.get(e['round_id'])
            if r['state']!='open':
                await i.response.send_message('Entry edits have closed.',ephemeral=True);return
            await i.response.send_modal(AnswerModal(e['round_id'],i.user.id,self.entry_id))
        edit.callback=edit_answer;self.add_item(edit)
        theme=discord.ui.Button(label='On Theme',emoji='🎭',style=discord.ButtonStyle.secondary,
                                custom_id=f'acro34:mark:{entry_id}',row=1)
        async def mark(i):
            e=arena.entry(self.entry_id)
            async with lock(i.channel_id):
                try:added=arena.marks(e['round_id'],i.user.id,self.entry_id)
                except ValueError as ex:
                    await i.response.send_message(str(ex),ephemeral=True);return
            await i.response.send_message('✅ On-theme endorsement '+('added.' if added else 'removed.'),ephemeral=True)
            await refresh_entry_card(self.entry_id)
        theme.callback=mark;self.add_item(theme)
        if thread_id:
            self.add_item(discord.ui.Button(label='Open discussion',emoji='🗨️',style=discord.ButtonStyle.link,
                                           url=f'https://discord.com/channels/{arena.get(arena.entry(entry_id)["round_id"])["guild_id"]}/{thread_id}',row=1))

async def refresh_entry_card(entry_id):
    card=arena.card(entry_id)
    if not card:return
    try:
        chan=bot.get_channel(card['channel_id']) or await bot.fetch_channel(card['channel_id'])
        msg=await chan.fetch_message(card['message_id'])
        await msg.edit(embed=card_embed(entry_id),view=CardView(entry_id,card['thread_id']),allowed_mentions=discord.AllowedMentions.none())
    except (discord.HTTPException,discord.Forbidden) as ex:print(f'Card refresh failed for {entry_id}: {ex}')

async def ensure_entry_card(entry_id):
    e=arena.entry(entry_id)
    if not e:return
    r=arena.get(e['round_id']);channel_id=r['channel_id']
    existing=arena.card(entry_id)
    if existing:
        await refresh_entry_card(entry_id)
        return
    try:
        chan=bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
        msg=await chan.send(embed=card_embed(entry_id),view=CardView(entry_id),allowed_mentions=discord.AllowedMentions.none())
        arena.record_card(entry_id,msg.id,channel_id)
        bot.add_view(CardView(entry_id),message_id=msg.id)
        try:
            thread=await msg.create_thread(name=f'Acro {r["slot"]} — Answer {entry_id} discussion',auto_archive_duration=1440)
            arena.set_thread(entry_id,thread.id)
            await refresh_entry_card(entry_id)
        except discord.HTTPException as ex:
            print(f'Thread creation failed for entry {entry_id}: {ex}')
            # The card still works; comments can be saved while permissions are corrected.
    except discord.HTTPException as ex:print(f'Card creation failed for entry {entry_id}: {ex}')

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
                msg=f'✅ Single started: **{label(arena.get(rid))}** • **{esc(theme)}** • AI {"ON" if ai_on else "OFF"}.'
            else:
                rid,selected=arena.champion(choice_round,i.user.id,theme,ai_on)
                msg=f'🏆 Champion selected **{esc(selected)}**. New single: **{label(arena.get(rid))}**.'
        except ValueError as e:
            await i.response.send_message(str(e),ephemeral=True);return
    await i.response.send_message(msg,ephemeral=True)
    await announce(i.channel_id,msg)
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
    phrase=discord.ui.TextInput(label='Your answer',max_length=200,placeholder='Bad Astronauts Demand Icecream')
    def __init__(self,rid,user_id,entry_id=None):
        super().__init__(timeout=300);self.rid=rid;self.entry_id=entry_id
        r=arena.get(rid)
        self.phrase.label=f'Expand {r["letters"]}'
        previous=next((e for e in arena.entries(rid) if e['user_id']==user_id),None)
        if previous:self.phrase.default=previous['answer'][:200]
    async def on_submit(self,i):
        async with lock(i.channel_id):
            try:earned=arena.enter(self.rid,i.user.id,str(self.phrase))
            except ValueError as e:
                await i.response.send_message(str(e),ephemeral=True);return
        entry=next(e for e in arena.entries(self.rid) if e['user_id']==i.user.id)
        await i.response.send_message('✅ Saved! '+('+1 participation point.' if earned else 'Your entry was updated.')+' An answer card is in the game channel.',ephemeral=True)
        await ensure_entry_card(entry['id'])
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
        await refresh_entry_card(self.eid)
        await announce(i.channel_id,f'💬 **Single #{arena.get(self.rid)["slot"]}, Answer {self.number}** — <@{i.user.id}>: {esc(str(self.message))}')

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
        if self.kind in ('vote','mark'):await refresh_entry_card(eid)
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
    @discord.ui.button(label='See entry cards',emoji='📇',style=discord.ButtonStyle.secondary)
    async def see_cards(self,i,b):
        entries=arena.entries(self.rid)
        if not entries:
            await i.response.send_message('No entries yet.',ephemeral=True);return
        links=[]
        for e in entries:
            card=arena.card(e['id'])
            if card:links.append(f'• [Entry #{e["id"]} — {esc(e["answer"][:60])}](https://discord.com/channels/{i.guild_id}/{card["channel_id"]}/{card["message_id"]})')
        await i.response.send_message('📇 **Persistent entry cards**\n'+('\n'.join(links) if links else 'Cards are being posted.'),ephemeral=True)

    @discord.ui.button(label='Jokes / Comments',emoji='💬',style=discord.ButtonStyle.secondary)
    async def comments(self,i,b):
        entries=arena.entries(self.rid)
        if not entries:
            await i.response.send_message('No answers to comment on yet.',ephemeral=True);return
        await i.response.send_message('\n'.join(f'**{n}.** {esc(e["answer"])}' for n,e in enumerate(entries,1)),
                                      view=AnswersView(self.rid,True),ephemeral=True)

class SingleSelect(discord.ui.Select):
    def __init__(self,rows):
        super().__init__(placeholder='Select a single to play',custom_id='acro33:single',options=[
            discord.SelectOption(label=f'Single {r["slot"]}: {r["letters"]}',value=str(r['id']),description=r['theme'][:85]) for r in rows])
    async def callback(self,i):
        rid=int(self.values[0]);r=arena.get(rid)
        if not r or r['channel_id']!=i.channel_id or r['state']=='done':
            await i.response.send_message('That single has ended. Open the dashboard again.',ephemeral=True);return
        if r['state']=='choice':
            await i.response.send_message('🏆 Waiting for the champion to pick the next theme.',ephemeral=True);return
        await i.response.send_message(f'**SINGLE {r["slot"]} — {label(r)}**\n🎭 {esc(r["theme"])}\n🤖 AI {"ON" if r["ai_allowed"] else "OFF"}\n<t:{r["deadline"]}:R>',view=SingleView(rid),ephemeral=True)

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
      '1. Tap **Play a single**, choose any live single.\n'
      '2. Tap **Enter / Edit** and expand each letter into one word. +1 point for submitting.\n'
      '3. Once two people enter, tap **Vote / Updoots**. 🏆 favorite = 3, 🥈 runner-up = 1. No self-voting.\n'
      '4. Every single has a persistent post with status and countdown. Every answer gets a public, persistent card and discussion thread. Comment there, or use the Comment button. First 3 bot replies earn +1 each.\n'
      '5. Mark other answers **On Theme** for +5 at results. One endorsement is enough.\n'
      '6. Winner gets +25 and one hour to choose next theme (4 suggestions, own, or auto).\n'
      '**AI ON/OFF is an honor system** set for the entire single. No AI detection.\n'
      '**Hosts:** `/acronym start` launches one single; up to five at once. `/acronym finish` closes early.')

@group.command(name='start',description='Host: launch one independent 24-hour single (up to five)')
async def start(i:discord.Interaction,ai_allowed:bool=False):
    if not await require_host(i):return
    if len(arena.active(i.channel_id))>=MAX_SINGLES:
        await i.response.send_message('Five singles are already running.',ephemeral=True);return
    await i.response.send_message(f'New single • **AI {"ON" if ai_allowed else "OFF"}**. Pick one of four funny themes or invent your own.',
                                  view=ThemeView(i.user.id,arena.choices(4),ai_on=ai_allowed),ephemeral=True)

@group.command(name='boards',description='View active singles and play')
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

@group.command(name='finish',description='Host: finish a single early, award points and announce winner')
async def finish(i:discord.Interaction,board:app_commands.Range[int,1,5]):
    if not await require_host(i):return
    row=next((r for r in arena.active(i.channel_id) if r['slot']==board and r['state']=='open'),None)
    if not row:
        await i.response.send_message('No open single in that slot.',ephemeral=True);return
    await i.response.defer(ephemeral=True)
    async with lock(i.channel_id): result=arena.finish(row['id'])
    await show_result(result)
    await i.followup.send('✅ Single results posted.',ephemeral=True)

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
        ending=f'🏆 Winner: <@{result["winner"]}> earns +25. `/acronym champion board:{result["slot"]}` to choose the next theme within one hour.'
    else:
        ending='🤝 Tie or no votes — no winner bonus. This single has ended; a host can launch another.'
    await announce(result['channel'],f'🎉 **SINGLE {result["slot"]} RESULTS**\n'+('\n'.join(lines) or 'No entries.')+'\n'+ending)
    for entry in arena.entries(result['id']):await refresh_entry_card(entry['id'])
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
                        await announce(row['channel_id'],f'🎲 Champion timeout: Auto Select chose **{esc(theme)}** for Single {row["slot"]} — {label(arena.get(new_id))}.')
                        await update_dashboard(row['channel_id'])
                        await ensure_single_post(rid)
                        await ensure_single_post(new_id)
                except Exception as exc:print(f'Timer {rid} failed: {exc!r}')
        await asyncio.sleep(20)

@bot.event
async def setup_hook():
    bot.add_view(DashboardView())
    for card in arena.cards():
        bot.add_view(CardView(card['entry_id'],card['thread_id']),message_id=card['message_id'])
    for post in arena.single_posts():
        bot.add_view(SinglePostView(post['round_id']),message_id=post['message_id'])
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
    for entry in arena.missing_cards():
        await ensure_entry_card(entry['id'])
    # Upgrade older live singles in place. Only missing ones receive a new post.
    for cid in channels:
        for row in arena.active(cid):
            await ensure_single_post(row['id'])

bot.tree.add_command(group)
if __name__=='__main__':
    if not TOKEN:raise SystemExit('Missing DISCORD_TOKEN in .env')
    bot.run(TOKEN)