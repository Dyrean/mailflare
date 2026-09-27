import array
import json
import math
import random
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RATE = 48000
SECONDS = 15
STARTS = [0.34, 3.38, 7.35, 11.82]


def narration():
    command = ['ffmpeg', '-y', '-loglevel', 'error']
    for i in range(4):
        command += ['-i', str(ROOT / f'voice-{i+1}.mp3')]
    filters = []
    for i, start in enumerate(STARTS):
        filters.append(f'[{i}:a]adelay={round(start*1000)}:all=1[v{i}]')
    filters.append('[v0][v1][v2][v3]amix=inputs=4:normalize=0,apad,atrim=duration=15,loudnorm=I=-16:TP=-2:LRA=8,aresample=48000[a]')
    command += ['-filter_complex', ';'.join(filters), '-map', '[a]', '-ac', '1', str(ROOT / 'narration.wav')]
    subprocess.run(command, check=True)
    with wave.open(str(ROOT / 'narration.wav')) as source:
        pcm = array.array('h', source.readframes(source.getnframes()))
    levels = []
    for n in range(900):
        block = pcm[n*800:(n+1)*800]
        energy = math.sqrt(sum(x*x for x in block)/max(1,len(block)))/32768
        levels.append(min(1, energy*9))
    (ROOT / 'speech-envelope.json').write_text(json.dumps(levels))


def add_note(track, start, duration, frequency, gain, pan=0, kind='bell'):
    first = round(start*RATE)
    count = min(round(duration*RATE), len(track)//2-first)
    for i in range(max(0,count)):
        t=i/RATE
        if kind=='bell':
            env=min(1,t/.008)*math.exp(-t*5)*min(1,(duration-t)/.1)
            val=(math.sin(2*math.pi*frequency*t)+.22*math.sin(2*math.pi*frequency*2.002*t))*env
        elif kind=='bass':
            env=min(1,t/.018)*min(1,(duration-t)/.12)
            val=(math.sin(2*math.pi*frequency*t)+.15*math.sin(2*math.pi*frequency*2*t))*env
        elif kind=='kick':
            val=math.sin(2*math.pi*(45*t+6*(1-math.exp(-t*30))))*math.exp(-t*14)
        elif kind=='pad':
            env=min(1,t/.3)*min(1,(duration-t)/.5)
            val=(math.sin(2*math.pi*frequency*t)+.3*math.sin(2*math.pi*frequency*1.003*t))*.6*env
        else:
            env=math.sin(math.pi*t/duration)**2
            val=(random.random()*2-1)*env*.55
        at=(first+i)*2
        track[at] += val*gain*(1-pan*.35)
        track[at+1] += val*gain*(1+pan*.35)


def score():
    random.seed(48)
    track=array.array('f',[0.0])*(RATE*SECONDS*2)
    # Original 120 BPM score: soft pulse, glass arpeggios, and a resolving major ninth.
    chords = [[146.832,220,293.665,369.994], [123.471,185,246.942,311.127], [97.999,146.832,195.998,246.942], [110,164.814,220,277.183]]
    for section,notes in enumerate(chords):
        start=[0,3,7,11][section]
        duration=[3.3,4.3,4.2,4][section]
        for j,note in enumerate(notes):
            add_note(track,start,duration,note,.017,(j-1.5)/2,'pad')
        for beat in range(math.ceil(duration*2)):
            at=start+beat*.5
            if at<14.4:
                add_note(track,at,.36,notes[0]/2,.045,0,'bass')
                add_note(track,at,.22,50,.038,0,'kick')
        for step in range(math.ceil(duration*4)):
            at=start+.125+step*.25
            if at<14.2:add_note(track,at,.7,notes[[0,2,1,3,2,1,3,2][step%8]]*4,.017,math.sin(step)*.9)
    for at in [2.75,6.75,10.75]:
        add_note(track,at,.49,0,.072,-.5,'noise')
        add_note(track,at+.24,.45,73.416,.063,0,'bass')
    for i,at in enumerate([1.48,3.7,4.1,4.55,5.2,7.55,7.73,7.91,8.1,8.6,12.6]):
        add_note(track,at,.25,[1174.66,1479.98,1760,2217.46][i%4],.030,(-1)**i*.55)
    for j,freq in enumerate([293.665,440,587.33,739.99,880]):
        add_note(track,12.55+j*.055,2.4,freq,.023,(j-2)/3)
    pcm=array.array('h')
    for i,value in enumerate(track):
        t=i/(RATE*2)
        fade=min(1,t/.15)*min(1,max(0,(15-t)/.8))
        pcm.append(round(max(-1,min(1,value*fade))*32767))
    with wave.open(str(ROOT/'score.wav'),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE);out.writeframes(pcm.tobytes())


def mix():
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(ROOT/'narration.wav'),'-i',str(ROOT/'score.wav'),'-filter_complex','[0:a]asplit=2[voice][control];[1:a][control]sidechaincompress=threshold=0.03:ratio=3:attack=15:release=180[bed];[voice][bed]amix=inputs=2:normalize=0,alimiter=limit=0.92,afade=t=out:st=14.65:d=0.35[a]','-map','[a]','-ar','48000','-ac','2',str(ROOT/'soundtrack.wav')],check=True)


def build_audio():
    narration()
    score()
    mix()
    print('Narration, speech animation envelope, and original score created.',flush=True)
