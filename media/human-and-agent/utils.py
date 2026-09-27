import math
import random
import struct
import subprocess
import wave
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
W, H, S, FPS = 1920, 1080, 2, 60
CREAM = '#F5F3EB'
INK = '#172824'
BLUE = '#2458ED'
LIME = '#D9F876'
PEACH = '#F8AF8E'
MUTED = '#72817B'
WHITE = '#FFFFFF'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def clamp(v):
    return max(0, min(1, v))


def ease(v):
    return 1 - (1 - clamp(v)) ** 4


def smooth(v):
    v = clamp(v)
    return v * v * (3 - 2 * v)


def pop(v):
    v = clamp(v)
    return 1 + 2.1 * (v - 1) ** 3 + 1.1 * (v - 1) ** 2


def mix(a, b, v):
    return a + (b - a) * v


@lru_cache(maxsize=120)
def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, round(size * S))


def txt(im, x, y, value, size, color=INK, bold=False, anchor='lt'):
    ImageDraw.Draw(im).text((round(x * S), round(y * S)), value, font=font(size, bold), fill=color, anchor=anchor, stroke_width=0)


def box(im, coords, fill, radius=0, outline=None, width=1):
    ImageDraw.Draw(im).rounded_rectangle(tuple(round(v * S) for v in coords), radius=round(radius * S), fill=fill, outline=outline, width=round(width * S))


def line(im, coords, color, width=1):
    ImageDraw.Draw(im).line(tuple(round(v * S) for v in coords), fill=color, width=max(1, round(width * S)), joint='curve')


def circle(im, x, y, r, fill=None, outline=None, width=1):
    ImageDraw.Draw(im).ellipse(tuple(round(v * S) for v in (x-r, y-r, x+r, y+r)), fill=fill, outline=outline, width=max(1, round(width * S)))


def poly(im, points, fill):
    ImageDraw.Draw(im).polygon([(round(x * S), round(y * S)) for x, y in points], fill=fill)


def arc(im, bounds, start, end, fill, width=3):
    ImageDraw.Draw(im).arc(tuple(round(v*S) for v in bounds), start, end, fill=fill, width=round(width*S))


def new(bg=CREAM):
    return Image.new('RGB', (W, H), bg)


def layer():
    return Image.new('RGBA', (W, H), (0, 0, 0, 0))


def paste(im, item, x=0, y=0, scale=1, rotation=0, opacity=1):
    if scale != 1:
        item = item.resize((max(1, round(item.width*scale)), max(1, round(item.height*scale))), Image.Resampling.BICUBIC)
    if rotation:
        item = item.rotate(rotation, Image.Resampling.BICUBIC, expand=True)
    if opacity < 1:
        item = item.convert('RGBA')
        item.putalpha(item.getchannel('A').point(lambda a: int(a*clamp(opacity))))
    im.paste(item, (round(x*S-item.width/2), round(y*S-item.height/2)), item if item.mode == 'RGBA' else None)


def reveal(im, x, y, value, size, t, delay=0, color=INK, bold=True):
    p = ease((t-delay)/0.65)
    if p <= 0:
        return
    patch = Image.new('RGBA', (W, round(size*1.32*S)))
    txt(patch, 0, (1-p)*size*1.45, value, size, color, bold)
    im.paste(patch, (round(x*S), round(y*S)), patch)


def spark(im, x, y, r, color=BLUE, rot=0):
    points = []
    for i in range(8):
        a = rot + math.pi*i/4
        rr = r if i%2 == 0 else r*0.25
        points.append((x+math.cos(a)*rr, y+math.sin(a)*rr))
    poly(im, points, color)


def check(im, x, y, size, color=INK):
    line(im, (x-size*.5, y, x-size*.1, y+size*.4, x+size*.65, y-size*.45), color, max(1.5,size*.15))


def envelope(im, x, y, w, color=BLUE, opened=0):
    h = w*.7
    box(im, (x-w/2,y-h/2,x+w/2,y+h/2), color, w*.08)
    poly(im, [(x-w*.45,y-h*.43),(x,y-h*.43-w*.28*opened),(x+w*.45,y-h*.43),(x,y+h*.13)], '#96CBFF')
    if opened:
        yy = y-w*.3*opened
        box(im,(x-w*.32,yy-h*.22,x+w*.32,yy+h*.27),CREAM,w*.03)
        circle(im,x-w*.1,yy,w*.016,INK)
        circle(im,x+w*.1,yy,w*.016,INK)
        arc(im,(x-w*.09,yy,x+w*.09,yy+w*.10),0,180,INK,w*.015)
    poly(im,[(x-w*.5,y-h*.39),(x+w*.03,y+h*.12),(x-w*.5,y+h*.5)],'#22B7E4')
    poly(im,[(x+w*.5,y-h*.39),(x-w*.04,y+h*.12),(x+w*.5,y+h*.5)],'#0493D1')
    poly(im,[(x-w*.5,y+h*.5),(x,y-h*.03),(x+w*.5,y+h*.5)],'#1EA7DF')


def brand(im, x=42, y=33, dark=False):
    envelope(im,x+10,y+8,21)
    txt(im,x+30,y-2,'mailflare',18,WHITE if dark else INK,True)


def footer(im, index, dark=False):
    color = '#A7BFFE' if dark else MUTED
    txt(im,42,505,'GOOD COMPANY FOR YOUR INBOX',9,color,True)
    txt(im,918,505,f'0{index} / 05',9,color,True,'rt')


def portrait(im,x,y,r,t,agent=False):
    if agent:
        box(im,(x-r,y-r,x+r,y+r),BLUE,r*.3)
        box(im,(x-r*.65,y-r*.32,x+r*.65,y+r*.47),CREAM,r*.22)
        for dx in [-.28,.28]:
            box(im,(x+r*dx-r*.06,y-r*.1,x+r*dx+r*.06,y+r*.13),INK,r*.05)
        line(im,(x,y-r*.36,x,y-r*.67),CREAM,3)
        circle(im,x,y-r*.73,r*.1,LIME)
        arc(im,(x-r*.21,y+r*.07,x+r*.21,y+r*.3),0,180,INK,2)
    else:
        circle(im,x,y,r,PEACH)
        arc(im,(x-r*.48,y-r*.77,x+r*.50,y+r*.1),185,343,INK,r*.19)
        for dx in [-.26,.26]:
            circle(im,x+r*dx,y-r*.01,r*.045,INK)
        arc(im,(x-r*.27,y-r*.03,x+r*.27,y+r*.44),0,180,INK,r*.05)
        circle(im,x-r*.47,y+r*.22,r*.10,'#EE8A72')
        circle(im,x+r*.47,y+r*.22,r*.10,'#EE8A72')


def opening(t):
    im=new()
    brand(im)
    footer(im,1)
    # A faint oversized orbit gives the typography a physical stage.
    circle(im,760,267,197,None,'#E0E4D8',1)
    circle(im,760,267,159,None,'#E0E4D8',1)
    reveal(im,54,150,'Email.',102,t)
    reveal(im,54,266,'With a smile.',65,t,.22)
    p=ease((t-.55)/.6)
    txt(im,57,366+18*(1-p),'A little more human. A lot more possible.',17,MUTED)
    card=Image.new('RGBA',(560,540))
    # Drawing helpers use the same two-pixel unit inside local assets.
    envelope(card,140,145,184,opened=ease((t-.55)/.8))
    paste(im,card,748,281+math.sin(t*3)*7,max(.01,pop(t/.8)),rotation=-9+4*math.sin(t*2))
    spark(im,635,131,23*pop((t-.4)/.5),BLUE,t*.5)
    spark(im,873,385,17*pop((t-.6)/.5),BLUE,-t*.7)
    q=pop((t-.85)/.45)
    circle(im,849,180,26*q,LIME)
    if q>.5:
        txt(im,849,181,'1',22,INK,True,'mm')
    line(im,(57,419,149+42*ease((t-.75)/.7),419),BLUE,4)
    return im


def partners(t):
    im=new()
    box(im,(480,0,960,540),'#E9EEFF')
    brand(im)
    footer(im,2)
    p=pop(t/.6)
    portrait(im,254,219+12*math.sin(t*3),67*p,t)
    portrait(im,706,219-12*math.sin(t*3),67*pop((t-.12)/.6),t,True)
    for k in range(19):
        xx=354+k*14
        circle(im,xx,220,1.7,'#A9B8A9')
    e=layer()
    envelope(e,480,220,53)
    xx=mix(364,597,(math.sin(t*2.8-1.5)+1)/2)
    im.paste(e,(round((xx-480)*S),round(9*math.sin(t*5)*S)),e)
    reveal(im,89,332,'For humans.',49,t,.08)
    reveal(im,525,332,'And agents.',49,t,.26,BLUE)
    txt(im,254,414,'Your people. Your conversations.',14,MUTED,anchor='mt')
    txt(im,706,414,'A helping hand, built right in.',14,'#687CA5',anchor='mt')
    spark(im,359,113,13,BLUE,t)
    spark(im,823,302,14,BLUE,-t)
    return im


def cursor(im,x,y,pressed=False):
    poly(im,[(x+2,y+3),(x+2,y+26),(x+9,y+20),(x+15,y+31),(x+21,y+27),(x+14,y+17),(x+25,y+15)],'#182924')
    poly(im,[(x,y),(x,y+22),(x+7,y+16),(x+14,y+28),(x+18,y+25),(x+11,y+14),(x+22,y+13)],WHITE)
    if pressed:
        circle(im,x+2,y+3,18,None,LIME,2)


def inbox(t):
    im=new('#E7EDFF')
    brand(im)
    footer(im,3)
    reveal(im,46,80,'Feels familiar. Does more.',40,t,0)
    ui=layer()
    box(ui,(60,152,900,477),'#CFD8F1',19)
    box(ui,(54,144,894,469),WHITE,19)
    box(ui,(54,144,220,469),'#F4F7FF',19)
    envelope(ui,80,169,18)
    txt(ui,98,160,'mailflare',14,INK,True)
    box(ui,(70,199,200,237),'#DBE7FF',12)
    txt(ui,89,210,'+  Compose',13,BLUE,True)
    for i,label in enumerate(['Inbox','Starred','Snoozed','Sent','Drafts']):
        yy=265+i*32
        if i==0:
            box(ui,(64,254,210,280),'#DEE8FD',12)
        circle(ui,82,yy+2,3,BLUE if i==0 else '#ABB6C7')
        txt(ui,96,yy-5,label,12,INK,i==0)
    box(ui,(237,158,874,195),'#F1F4FA',17)
    circle(ui,255,175,5,None,'#68798E',1.5)
    line(ui,(259,179,263,183),'#68798E',1.5)
    txt(ui,275,168,'Search your mail',12,'#8290A1')
    txt(ui,243,215,'Inbox',20,INK,True)
    txt(ui,870,219,'hello@your.studio',11,MUTED,anchor='rt')
    entries=[('M','Maya','A little launch magic','Ready when you are.','#F8AF8E'),('J','Jamie','Coffee next week?','Tuesday sounds good.','#D9F876'),('S','Studio','The ideas are in','Three directions to explore.','#DBD2F9'),('A','Alex','That looks wonderful','Thanks for the lovely work.','#BDEBEE')]
    for i,(initial,name,subject,body,color) in enumerate(entries):
        p=ease((t-.13-i*.06)/.45)
        y=252+i*50+(1-p)*20
        if i==0:
            box(ui,(234,y-5,880,y+43),'#ECF1FF',9)
        circle(ui,254,y+17,13,color)
        txt(ui,254,y+17,initial,11,INK,True,'mm')
        txt(ui,278,y+2,name,11,INK,True)
        txt(ui,365,y+2,subject,12,INK,True)
        txt(ui,365,y+20,body,10,MUTED)
        if i>0:
            line(ui,(240,y+43,878,y+43),'#EEF0F5')
    p=ease(t/.7)
    scale=.90+.10*p
    paste(im,ui,480,270+(1-p)*110,scale)
    # The agent's draft is staged as a readable foreground interaction.
    a=ease((t-1)/.5)
    if a>0:
        panel=layer()
        box(panel,(462,233,891,465),'#C0CCE8',17)
        box(panel,(454,225,883,457),WHITE,17,outline='#D0DCFA')
        circle(panel,478,248,12,BLUE)
        spark(panel,478,248,7,LIME,math.pi/4)
        txt(panel,499,239,'Your agent',14,INK,True)
        box(panel,(773,237,865,260),'#EEF5E3',10)
        txt(panel,819,244,'DRAFT READY',8,INK,True,'mt')
        line(panel,(472,273,866,273),'#EBEEF3')
        txt(panel,476,287,'Re: A little launch magic',12,INK,True)
        sentence='Hi Maya, everything is ready for launch.'
        count=round(len(sentence)*clamp((t-1.55)/.6))
        txt(panel,476,318,sentence[:count],12,'#58655F')
        if t>1.95:
            txt(panel,476,338,'Excited to share this with the world!',12,'#58655F')
        line(panel,(472,375,866,375),'#EBEEF3')
        txt(panel,476,399,'A draft from your agent. A final say from you.',10,MUTED)
        box(panel,(713,419,864,447),BLUE,13)
        txt(panel,788,428,'Review & send',11,WHITE,True,'mt')
        paste(im,panel,480+28*(1-a),270+50*(1-a),opacity=a)
    if t>2.4:
        p=ease((t-2.4)/.55)
        cursor(im,mix(913,811,p),mix(485,430,p),2.98<t<3.16)
    # Explicit review before delivery, matching Mailflare's confirmation flow.
    r=ease((t-3.08)/.24)
    if r>0 and t<4.18:
        panel=layer()
        box(panel,(498,280,870,454),CREAM,15,outline='#C9D8EC')
        txt(panel,522,300,'Looks good?',23,INK,True)
        txt(panel,522,338,'To Maya · Re: A little launch magic',12,MUTED)
        box(panel,(677,396,846,433),BLUE,17)
        txt(panel,760,408,'Confirm and send',12,WHITE,True,'mt')
        paste(im,panel,480,270+16*(1-r),opacity=r)
        cursor(im,815,417,3.88<t<4.1)
    if t>=4.18:
        z=pop((t-4.18)/.35)
        toast=layer()
        box(toast,(595,371,856,440),LIME,20)
        circle(toast,626,405,14,INK)
        check(toast,626,405,10,LIME)
        txt(toast,654,389,'Sent. Nice teamwork.',15,INK,True)
        txt(toast,654,413,'One inbox. Better together.',10,INK)
        paste(im,toast,480,270+18*(1-z),opacity=min(1,z))
    return im


def ownership(t):
    im=new(LIME)
    brand(im)
    footer(im,4)
    # Big concentric shapes stay outside the reading area.
    for i in range(4):
        circle(im,905,293,125+i*44+12*math.sin(t*1.4),None,'#B9D969',1)
    reveal(im,55,128,'Your domain.',76,t)
    reveal(im,55,222,'Your rules.',76,t,.15)
    p=pop((t-.35)/.6)
    tag=Image.new('RGBA',(1190,174))
    box(tag,(0,0,586,79),INK,39)
    envelope(tag,42,39,31)
    txt(tag,79,23,'hello@your.studio',31,CREAM,True)
    circle(tag,547,39,16,LIME)
    check(tag,547,39,12)
    paste(im,tag,352,390+30*(1-p),max(.01,p),rotation=-2+1.5*ease(t/.8))
    p=ease((t-.7)/.5)
    txt(im,62,458+12*(1-p),'Custom domains. Shared inboxes. You’re at home.',16,INK)
    spark(im,799,154,48*pop(t/.6),BLUE,t*.6)
    spark(im,855,362,21,BLUE,-t)
    return im


def closing(t):
    im=new(BLUE)
    # Deliberately hold the completed end card for a comfortable reading beat.
    for i in range(3):
        circle(im,482,239,225+i*70+min(t,1)*8,None,'#3869EF')
    p=pop(t/.6)
    mark=Image.new('RGBA',(256,256))
    box(mark,(0,0,128,128),CREAM,32)
    envelope(mark,64,72,87,opened=.5)
    paste(im,mark,480,134,max(.01,p),rotation=-9*(1-ease(t/.7)))
    # Centered title is masked upward with the same timing as the opening.
    title='mailflare'
    tw=ImageDraw.Draw(im).textlength(title,font=font(80,True))/S
    reveal(im,(960-tw)/2,227,title,80,t,.15,CREAM)
    q=ease((t-.3)/.65)
    txt(im,480,343+(1-q)*24,'Email for humans. And their agents.',24,CREAM,False,'mt')
    if t>.55:
        b=pop((t-.55)/.5)
        badge=Image.new('RGBA',(700,108))
        box(badge,(0,0,346,50),LIME,25)
        txt(badge,173,16,'Make room for better email.  ↗',17,INK,True,'mt')
        paste(im,badge,480,427,max(.01,b))
    spark(im,202,252,19,CREAM,t*.25)
    spark(im,761,189,27,LIME,-t*.25)
    txt(im,480,505,'YOUR DOMAIN. YOUR INBOX.',10,'#BDCEFF',True,'mt')
    return im


def frame(t):
    scenes=[opening,partners,inbox,ownership,closing]
    starts=[0,2.5,5,10,12.5]
    index=max(i for i,start in enumerate(starts) if t>=start)
    local=t-starts[index]
    im=scenes[index](local)
    # Fast traveling flap wipes bridge scenes like a message being handed over.
    if index and local<.24:
        p=clamp(local/.24)
        previous=scenes[index-1](starts[index]-starts[index-1]+local)
        edge=round(W*p)
        im.paste(previous.crop((edge,0,W,H)),(edge,0))
        poly(im,[(960*p-55,0),(960*p+15,0),(960*p+75,270),(960*p+15,540),(960*p-55,540),(960*p+5,270)],BLUE if index!=4 else LIME)
    return im


def soundtrack():
    sr=44100
    n=sr*15
    # Pure Python synthesis keeps this source portable without music assets.
    left=[0.0]*n
    right=[0.0]*n
    rng=random.Random(29)
    chords=[(146.832,184.997,220.0),(123.471,146.832,184.997),(97.999,123.471,146.832),(110.0,138.591,164.814)]
    for beat in range(30):
        start=int(beat*.5*sr)
        notes=chords[(beat//8)%4]
        # Warm, short kick and crisp offbeat snare.
        for j in range(int(.22*sr)):
            k=start+j
            if k>=n:
                break
            s=j/sr
            kick=.32*math.sin(2*math.pi*(49*s+6*(1-math.exp(-s*36))))*math.exp(-s*23)
            snare=(rng.random()*2-1)*math.exp(-s*40)*.13 if beat%2 else 0
            v=kick+snare
            left[k]+=v
            right[k]+=v
        for sub in range(2):
            start2=start+int(sub*.25*sr)
            for j in range(int(.055*sr)):
                k=start2+j
                if k>=n:
                    break
                s=j/sr
                v=(rng.random()*2-1)*math.exp(-s*85)*.035
                left[k]+=v*.7
                right[k]+=v
        # Eighth-note bell motif; chord changes give the short film a finish.
        for sub in range(2):
            onset=start+int(sub*.25*sr)
            freq=notes[(beat+sub)%3]*(4 if (beat+sub)%4==0 else 2)
            for j in range(int(.36*sr)):
                k=onset+j
                if k>=n:
                    break
                s=j/sr
                env=min(1,s/.004)*math.exp(-s*13)
                v=.065*env*(math.sin(2*math.pi*freq*s)+.25*math.sin(2*math.pi*freq*2*s))
                left[k]+=v*(.8 if sub else 1)
                right[k]+=v*(1 if sub else .8)
                echo=k+int(.125*sr)
                if echo<n:
                    right[echo]+=v*.22
        freq=notes[0]/2
        for j in range(int(.43*sr)):
            k=start+j
            if k>=n:
                break
            s=j/sr
            v=.115*min(1,s/.008)*math.exp(-s*7)*math.sin(2*math.pi*freq*s)
            left[k]+=v
            right[k]+=v
    for onset in [2.43,4.93,9.93,12.43]:
        start=int(onset*sr)
        for j in range(int(.25*sr)):
            k=start+j
            if k>=n:
                break
            u=j/(.25*sr)
            v=(rng.random()*2-1)*math.sin(math.pi*u)**3*.10
            left[k]+=v*(1-u)
            right[k]+=v*u
    for onset,freq in [(9.2,880),(9.32,1174.66),(12.7,587.33)]:
        for j in range(int(.4*sr)):
            k=int(onset*sr)+j
            if k<n:
                s=j/sr
                v=.10*math.sin(2*math.pi*freq*s)*math.exp(-s*12)*min(1,s/.003)
                left[k]+=v
                right[k]+=v
    audio=bytearray()
    for i,(l,r) in enumerate(zip(left,right)):
        fade=min(1,i/(sr*.02))*smooth((n-i)/(sr*.48))
        audio.extend(struct.pack('<hh',round(math.tanh(l*1.7)*26000*fade),round(math.tanh(r*1.7)*26000*fade)))
    path=ROOT/'soundtrack.wav'
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(sr)
        out.writeframes(audio)
    return path


def render():
    audio=soundtrack()
    output=ROOT/'mailflare-human-and-agent.mp4'
    command=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(audio),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-ar','44100','-t','15','-movflags','+faststart',str(output)]
    proc=subprocess.Popen(command,stdin=subprocess.PIPE)
    for i in range(15*FPS):
        im=frame(i/FPS)
        proc.stdin.write(im.tobytes())
        if i in [90,240,450,660,840]:
            im.save(ROOT/f'scene-{i//FPS:02}.png')
        if i%(FPS*3)==0:
            print(f'Rendered {i//FPS}/15 seconds',flush=True)
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError('FFmpeg did not complete the video export.')
    frame(14).save(ROOT/'poster.png')
    print(output,flush=True)
