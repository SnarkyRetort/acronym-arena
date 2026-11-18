"""Acro Arena v3.5 dynamic unified challenge artwork. Pure renderer; never changes gameplay."""
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W=1200
BG=(20,16,29)
PANEL=(39,27,52)
PURPLE=(142,72,205)
GOLD=(246,194,80)
WHITE=(250,244,250)
MUTED=(187,176,197)
GREEN=(91,199,114)


def font(size,bold=False,serif=False):
    if serif:
        names=['C:/Windows/Fonts/georgiab.ttf','C:/Windows/Fonts/georgia.ttf',
               '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']
    elif bold:
        names=['C:/Windows/Fonts/arialbd.ttf','C:/Windows/Fonts/segoeuib.ttf',
               '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
    else:
        names=['C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/segoeui.ttf',
               '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for name in names:
        if Path(name).is_file():return ImageFont.truetype(name,size)
    return ImageFont.load_default()


def fit(draw,text,max_width,size,bold=False,serif=False,min_size=23):
    while size>min_size and draw.textbbox((0,0),text,font=font(size,bold,serif))[2] > max_width:
        size-=2
    return font(size,bold,serif)


def shorten(draw,text,max_width,fnt):
    if draw.textbbox((0,0),text,font=fnt)[2] <= max_width:return text
    while text and draw.textbbox((0,0),text+'…',font=fnt)[2] > max_width:
        text=text[:-1]
    return text.rstrip()+'…'


def centered(d,y,text,fnt,color,shadow=False):
    box=d.textbbox((0,0),text,font=fnt)
    x=(W-(box[2]-box[0]))//2
    if shadow:d.text((x+2,y+3),text,font=fnt,fill=(60,28,74))
    d.text((x,y),text,font=fnt,fill=color)


def make_challenge_image(row,entries,stats,players,banner_path,version='3.5.0'):
    """All data comes from database snapshots; players maps user_id to display names.

    Each row is immutable input and output is an in-memory PNG for Discord.
    """
    count=len(entries)
    header=785
    tail=125
    card_h=118
    H=header+max(1,count)*card_h+tail
    im=Image.new('RGB',(W,H),BG)
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((10,10,W-11,H-11),radius=26,outline=PURPLE,width=8)
    d.rounded_rectangle((20,20,W-21,H-21),radius=20,outline=GOLD,width=2)
    banner=Image.open(banner_path).convert('RGB')
    bw,bh=banner.size
    wanted=(1150,300)
    ratio=max(wanted[0]/bw,wanted[1]/bh)
    banner=banner.resize((int(bw*ratio),int(bh*ratio)),Image.Resampling.LANCZOS)
    ox=(banner.width-wanted[0])//2; oy=(banner.height-wanted[1])//2
    banner=banner.crop((ox,oy,ox+wanted[0],oy+wanted[1]))
    im.paste(banner,(25,25))
    d.rounded_rectangle((25,25,1174,325),radius=12,outline=GOLD,width=3)
    centered(d,347,f'ACRO ARENA  ·  CHALLENGE #{row["id"]}',font(37,True,True),WHITE,True)
    d.line((90,408,1110,408),fill=GOLD,width=3)
    letters=' · '.join(row['letters'])
    centered(d,428,letters,fit(d,letters,1060,93,True,True,48),WHITE,True)
    d.line((95,547,1105,547),fill=PURPLE,width=4)
    theme=str(row['theme'])
    centered(d,558,shorten(d,theme,1050,fit(d,theme,1050,53,True)),fit(d,theme,1050,53,True),WHITE,True)
    status='CHAMPION CHOOSES NEXT THEME' if row['state']=='choice' else ('FINAL RESULTS' if row['state']=='done' else 'ENTRIES OPEN' if count<2 else 'ENTRIES + VOTING OPEN')
    d.rounded_rectangle((62,635,1138,703),radius=15,fill=(38,31,48),outline=(107,76,138),width=2)
    d.ellipse((80,660,103,683),fill=GREEN if row['state']=='open' else GOLD)
    d.text((120,648),status,font=font(27,True),fill=WHITE)
    d.text((705,648),f'{count} entries  ·  {stats["firsts"]} first  ·  {stats["seconds"]} second',font=fit(d,f'{count} entries  ·  {stats["firsts"]} first  ·  {stats["seconds"]} second',410,25,True),fill=GOLD)
    centered(d,723,f'PLAYER ANSWERS ({count})',font(31,True,True),GOLD)
    start=785
    if not count:
        d.rounded_rectangle((58,start,1142,start+105),radius=16,fill=PANEL,outline=(93,65,123),width=2)
        centered(d,start+28,'Be the first to submit an acronym.',font(29),WHITE)
    for ix,e in enumerate(entries):
        y=start+ix*card_h
        d.rounded_rectangle((58,y,1142,y+105),radius=15,fill=PANEL,outline=(110,75,143),width=2)
        d.rounded_rectangle((74,y+15,126,y+73),radius=12,fill=(86,54,118))
        d.text((84,y+27),str(ix+1),font=font(27,True),fill=GOLD)
        uid=e['user_id']; name=players.get(uid,f'Player {ix+1}')
        name=shorten(d,str(name),680,font(26,True))
        d.text((148,y+9),name,font=font(26,True),fill=GOLD)
        answer=shorten(d,e['answer'],720,font(29,True))
        d.text((148,y+48),answer,font=font(29,True),fill=WHITE)
        d.text((898,y+12),f'1st {e["firsts"]}   2nd {e["seconds"]}',font=font(22,True),fill=MUTED)
        d.text((898,y+80),f'{e["comments"]} replies  ·  {e["marks"]} on-theme',font=font(18),fill=MUTED)
    d.line((68,H-104,1132,H-104),fill=GOLD,width=2)
    centered(d,H-94,'AI OK' if row['ai_allowed'] else 'AI FREE  ·  HONOR SYSTEM',font(22,True),GOLD)
    centered(d,H-57,f'Acro Arena v{version}  •  Challenge #{row["id"]}  •  +1 entry  ·  +5 On Theme  ·  +25 Winner',font(19),MUTED)
    output=BytesIO()
    im.save(output,format='PNG',optimize=True)
    output.seek(0)
    return output