import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const require = createRequire('/tmp/mailflare-film-tools/package.json');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const ROOT = dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080, FPS = 60;
const C = { ink: '#111D3C', blue: '#185BFF', cyan: '#69DEFF', pale: '#F1F5FF', muted: '#7787A5', white: '#FFFFFF', navy: '#07122F', green: '#64EDB4' };
GlobalFonts.registerFromPath(join(ROOT, '../../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2'), 'Geist');
GlobalFonts.registerFromPath('/System/Library/Fonts/Menlo.ttc', 'Mono');
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const voice = JSON.parse(readFileSync(join(ROOT, 'speech-envelope.json')));

export function clamp(v) { return Math.max(0, Math.min(1, v)); }
export function lerp(a, b, p) { return a + (b - a) * p; }
export function ease(v) { return 1 - (1 - clamp(v)) ** 4; }
export function smooth(v) { v = clamp(v); return v * v * (3 - 2 * v); }
export function spring(v) { v = clamp(v); return 1 - Math.exp(-7.5 * v) * Math.cos(9.5 * v); }
export function rr(x,y,w,h,r,fill,stroke=null,lw=1) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
}
export function line(points,color,width=2) {
  ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
}
export function ellipse(x,y,rx,ry,fill) {ctx.beginPath();ctx.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
export function text(s,x,y,size=30,color=C.ink,weight=500,align='left') {
  ctx.font=`${Math.round(weight/100)*100} ${size}px Geist`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(s,x,y);
}
export function mono(s,x,y,size=22,color=C.muted,align='left') {ctx.font=`${size}px Mono`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(s,x,y);}
export function gradient(x,y,x2,y2,colors) {const g=ctx.createLinearGradient(x,y,x2,y2);colors.forEach((c,i)=>g.addColorStop(i/(colors.length-1),c));return g;}
export function halo(x,y,r,color) {const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,`${color.slice(0,7)}00`);ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
export function shadow(alpha=.18,blur=50,dy=25) {ctx.shadowColor=`rgba(12,35,92,${alpha})`;ctx.shadowBlur=blur;ctx.shadowOffsetY=dy;}
export function clearShadow() {ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;}
export function check(x,y,s,color=C.blue) {line([[x-s*.4,y],[x-s*.08,y+s*.3],[x+s*.5,y-s*.4]],color,s*.14);}
export function arrow(x,y,s,color=C.blue) {line([[x-s*.6,y],[x+s*.4,y]],color,3);line([[x,y-s*.4],[x+s*.4,y],[x,y+s*.4]],color,3);}
export function envelope(x,y,s,color=C.blue,open=0) {
  ctx.save();ctx.translate(x,y);ctx.scale(s/100,s/100);
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-47,-21);ctx.lineTo(0,-53-open*12);ctx.lineTo(47,-21);ctx.lineTo(47,39);ctx.lineTo(-47,39);ctx.closePath();ctx.fill();
  rr(-35,-25,70,56,4,'#FFF');
  ctx.fillStyle='#42C5EE';ctx.beginPath();ctx.moveTo(-47,-20);ctx.lineTo(47,39);ctx.lineTo(-47,39);ctx.fill();
  ctx.fillStyle='#139FD8';ctx.beginPath();ctx.moveTo(47,-20);ctx.lineTo(-47,39);ctx.lineTo(47,39);ctx.fill();ctx.restore();
}
export function spark(x,y,s,color=C.blue,angle=0) {ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<8;i++){let a=i*Math.PI/4,r=i%2?s*.23:s; i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.restore();}
export function pill(s,x,y,w,dark=false,icon=false) {rr(x,y,w,48,24,dark?'#14264A':'#FFFFFFCC',dark?'#38527C':'#D9E3F7');if(icon){ellipse(x+24,y+24,4,4,C.green);}text(s,x+(icon?40:w/2),y+24,19,dark?'#BED4F9':C.ink,550,icon?'left':'center');}
export function reveal(s,x,y,size,t,delay=0,color=C.ink,weight=650,align='left') {
  let p=ease((t-delay)/.62);if(p<=0)return;ctx.save();ctx.beginPath();ctx.rect(0,y-size*.7,W,size*1.45);ctx.clip();text(s,x,y+(1-p)*size*1.5,size,color,weight,align);ctx.restore();
}
export function chrome(t,n,dark=false) {
  const col=dark?'#F4F8FF':C.ink;ctx.save();ctx.globalAlpha=ease(t/.4);envelope(102,79,41);text('Mailflare',137,78,28,col,670);mono('MAKE IT YOURS',1817,79,16,dark?'#A2B9E8':C.muted,'right');
  text('PROFESSIONAL EMAIL. PERSONAL BY DESIGN.',83,1028,14,dark?'#7188B3':'#8A99B7',600);mono(`0${n} / 04`,1837,1028,16,dark?'#A2B9E8':C.muted,'right');ctx.restore();
}
export function background(t,dark=false,blue=false) {
  ctx.fillStyle=blue?'#1454F3':dark?C.navy:'#F4F7FE';ctx.fillRect(0,0,W,H);
  if(blue){halo(300+80*Math.sin(t),150,1100,'#468CFF');halo(1670,1000,900,'#092681');}
  else if(dark){halo(1000,650,850,'#123C8B');halo(1750,100,550,'#153151');}
  else {halo(1550+60*Math.sin(t*.6),380,780,'#C6D8FF');halo(200,1000,650,'#DAEFFF');}
  ctx.save();ctx.globalAlpha=dark?.1:.055;ctx.strokeStyle=dark?'#A2C3FF':'#3D73CA';ctx.lineWidth=1;
  for(let x=-100;x<W+100;x+=80){ctx.beginPath();ctx.moveTo(x+Math.sin(t*.2)*25,0);ctx.lineTo(x+Math.sin(t*.2)*25,H);ctx.stroke();}
  for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.restore();
  for(let i=0;i<28;i++){const x=(i*379.41+Math.sin(t*.35+i)*40)%W,y=(i*163.59-t*(5+i%6)+H*2)%H;ellipse(x,y,i%3===0?2:1,i%3===0?2:1,dark?'#40619B55':'#6186BA44');}
}
export function limb(x,y,length,angle,hand=false) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);shadow(.16,16,8);rr(-length/2,-21,length,42,21,gradient(0,-21,0,21,['#FFFFFF','#CAD9F1','#91AAD5']));clearShadow();
  if(hand){ellipse(length/2+4,0,31,33,gradient(length/2-20,-25,length/2+27,26,['#FFF','#E6EEFE','#9DBBE8']));line([[length/2+17,-14],[length/2+22,-6]],'#AEC3E6',3);}
  ctx.restore();
}
export function robot(x,y,s,t,gesture=0,dark=false) {
  const bob=Math.sin(t*3.1)*9, talk=voice[Math.min(voice.length-1,Math.floor(t*60))]||0;
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  ellipse(0,267,167,24,dark?'#01092344':'#173E7C15');halo(0,270,210,dark?'#2881FF18':'#658EFF19');
  ctx.translate(0,bob);ctx.rotate(Math.sin(t*2)*.025);
  const wave=Math.sin(t*8)*.18;
  limb(-127,80,117,1.2+Math.sin(t*3)*.1,true);
  const reach=gesture===1?-.95+wave:gesture===2?-.4: .9+Math.sin(t*3+1)*.13;
  limb(139,gesture===1?3:77,126,reach,true);
  shadow(.22,40,20);rr(-101,33,202,161,66,gradient(-110,30,90,185,['#7DB8FF','#246AF9','#113CB7']));clearShadow();
  rr(-84,45,140,20,10,'#BCD9FF44');
  ellipse(-54,195,41,31,gradient(-80,180,-36,223,['#EFF5FF','#B5CAED']));ellipse(55,195,41,31,gradient(30,180,86,223,['#EFF5FF','#B5CAED']));
  rr(-26,72,52,50,14,'#EDF5FF');envelope(0,97,33);
  rr(-43,-3,86,46,20,'#B4CDF2');
  shadow(.28,47,17);rr(-154,-207,308,236,77,gradient(-130,-205,164,64,['#FFFFFF','#EFF5FF','#BCD1EF']));clearShadow();
  rr(-139,-195,266,54,35,gradient(0,-195,0,-141,['#FFFFFF','#F8FAFF00']));
  ctx.strokeStyle='#FFFFFF';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-151,-204,302,229,74);ctx.stroke();
  rr(-125,-160,250,141,44,gradient(-100,-160,95,-10,['#25365A','#09162F','#06102C']));
  rr(-105,-151,166,10,5,'#FFFFFF16');
  let blink=1-Math.pow(Math.max(0,Math.cos(t*2.1)),28)*.94;
  const pupil=gesture===2?9:Math.sin(t*1.4)*4;
  for(const ex of [-51,51]){ctx.save();ctx.shadowBlur=20;ctx.shadowColor='#61DEFF';rr(ex-13+pupil,-113,25,Math.max(4,37*blink),12,'#8EEBFF');ctx.restore();ellipse(ex-6+pupil,-105,3,3,'#FFF');}
  if(talk>.09){ellipse(0,-54,14+talk*5,4+talk*18,'#83DAFF');ellipse(0,-48+talk*2,8,3,'#E6FCFF');}
  else {ctx.beginPath();ctx.ellipse(0,-61,19,13,0,.2,Math.PI-.2);ctx.strokeStyle='#82DCFF';ctx.lineWidth=5;ctx.stroke();}
  ellipse(-95,-66,13,5,'#458BBD33');ellipse(95,-66,13,5,'#458BBD33');
  rr(-13,-252,26,52,12,gradient(-13,0,13,0,['#BFD3EF','#FFF','#ABBFE2']));
  ctx.save();ctx.shadowBlur=35;ctx.shadowColor='#53BFFF';ellipse(0,-255,19,19,gradient(-15,-271,18,-239,['#BAF6FF','#4ACDFF','#2588F3']));ctx.restore();ellipse(-6,-262,5,5,'#F2FFFF');
  ellipse(-156,-90,12,34,'#BDCEF0');ellipse(156,-90,12,34,'#8AA9DE');
  ctx.restore();
}
export function floatMail(x,y,s,t,angle=0,dark=false) {ctx.save();ctx.translate(x,y+Math.sin(t*3+x)*8);ctx.rotate(angle);shadow(.16,35,13);rr(-s*.7,-s*.55,s*1.4,s*1.1,s*.22,dark?'#183864':'#FFFFFF');clearShadow();envelope(0,2,s*.75);ctx.restore();}
export function sceneIntro(t) {
  background(t);chrome(t,1);let p=spring(t/.8);
  ctx.save();ctx.translate(1510,590);ctx.rotate(-.35+t*.045);ctx.strokeStyle='#C5D8F5';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,325,260,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  floatMail(1330,290,73,t,-.23);floatMail(1762,676,83,t,.2);spark(1730,332,24,C.blue,t*.35);
  pill('YOUR NEXT CHAPTER',142,228,247);
  reveal('You mean',136,357,121,t,.08);reveal('business.',136,489,121,t,.2,C.blue);
  let a=ease((t-.7)/.55);ctx.save();ctx.globalAlpha=a;ctx.translate(0,(1-a)*50);shadow(.1,45,20);rr(140,604,1100,124,33,'#FFFFFF','#DDE6F8',1.5);clearShadow();envelope(202,669,52);
  const swap=smooth((t-1.25)/.48);text('hello@',250,665,60,C.ink,580);ctx.save();ctx.beginPath();ctx.rect(442,619,630,100);ctx.clip();ctx.globalAlpha=1-swap;text('gmail.com',442,665-swap*75,60,'#8493AF',500);ctx.globalAlpha=swap;text('mailflare.co',442,742-swap*77,60,C.blue,620);ctx.restore();
  ctx.globalAlpha=a*swap;ellipse(1172,666,27,27,'#E1F7EE');check(1172,666,26,'#1B9B6D');ctx.restore();
  reveal('An address that’s unmistakably yours.',146,789,30,t,1.65,C.muted,450);
  robot(1530,570+(1-p)*740,1.04*p,t,1);
  const pulse=clamp((t-1.45)/.7);if(pulse>0&&pulse<1){ctx.save();ctx.globalAlpha=(1-pulse)*.6;ctx.strokeStyle=C.blue;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(140-pulse*25,604-pulse*25,1100+pulse*50,124+pulse*50,33+pulse*25);ctx.stroke();ctx.restore();}
  mono('01  /  OWN YOUR ADDRESS',147,887,18,'#6D86B2');
}
export function search(x,y,w) {rr(x,y,w,42,12,'#F2F5FA');ctx.strokeStyle='#8190A9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+23,y+19,6,0,Math.PI*2);ctx.stroke();line([[x+28,y+24],[x+33,y+29]],'#8190A9',2);text('Search your mail',x+48,y+21,16,'#8D99AD',450);mono('⌘ K',x+w-19,y+22,12,'#8D99AD','right');}
export function navIcon(index,x,y,color) {
  ctx.save();ctx.translate(x,y);
  if(index===0){rr(-9,-7,18,14,3,null,color,1.7);line([[-9,-1],[-3,-1],[-1,3],[3,3],[5,-1],[9,-1]],color,1.7);}
  else if(index===1){const points=[];for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?4:10;points.push([Math.cos(a)*r,Math.sin(a)*r]);}points.push(points[0]);line(points,color,1.7);}
  else if(index===2){line([[-10,-7],[10,0],[-10,8],[-5,0],[-10,-7]],color,1.7);line([[-5,0],[10,0]],color,1.7);}
  else if(index===3){rr(-7,-10,14,20,2,null,color,1.7);line([[-3,-4],[3,-4]],color,1.7);line([[-3,1],[3,1]],color,1.7);line([[-3,6],[1,6]],color,1.7);}
  else {rr(-9,-5,18,14,2,null,color,1.7);rr(-10,-9,20,5,1,null,color,1.7);line([[-3,1],[3,1]],color,1.7);}
  ctx.restore();
}
export function inbox(t) {
  const w=1420,h=586;shadow(.17,65,30);rr(0,0,w,h,25,'#FFF','#D4DFF2',1.5);clearShadow();
  ctx.save();ctx.beginPath();ctx.roundRect(0,0,w,h,25);ctx.clip();rr(0,0,230,h,0,'#F4F7FC');
  envelope(37,39,31);text('Mailflare',64,39,23,C.ink,650);rr(20,89,188,49,14,'#175BFF');text('+  Compose',114,113,19,'#FFF',550,'center');
  const labels=['Inbox','Starred','Sent','Drafts','Archive'];for(let i=0;i<5;i++){if(i===0)rr(16,164+i*48,197,42,10,'#E2EBFF');navIcon(i,43,185+i*48,i===0?C.blue:'#7C8BA3');text(labels[i],68,185+i*48,18,i===0?C.blue:'#64718B',i===0?650:450);if(i===0)text(t>.8?'4':'3',190,185,15,C.blue,650,'right');}
  text('MAILBOXES',29,455,11,'#8A96AC',650);ellipse(39,492,5,5,C.blue);text('hello@mailflare.co',54,492,15,'#627493');ellipse(39,531,5,5,'#5DC0A1');text('support@mailflare.co',54,531,15,'#627493');
  line([[230,0],[230,h]],'#DFE6F1',1);text('Inbox',258,39,27,C.ink,630);search(940,20,448);line([[230,76],[w,76]],'#E7ECF5',1);
  const names=['Alex Morgan','Sam from Studio','Design team','Hieu Nguyen'];const subjects=['Let’s build something great.','Welcome to your new workspace','Brand assets, delivered.','Ready when you are.'];
  const previews=['Everything you need to get started.','Your next big idea starts here.','The latest files are all here.','See you on the other side.'];
  for(let i=0;i<4;i++){let p=ease((t-.2-i*.16)/.5);ctx.save();ctx.globalAlpha=p;ctx.translate((1-p)*160,0);const y=95+i*111;if(i===0)rr(244,y,519,102,14,'#EAF0FF');ellipse(275,y+26,5,5,i===0?C.blue:'#B6C4D9');text(names[i],295,y+24,17,C.ink,650);text(i===0?'Now':`${i*4}m`,740,y+24,13,'#8B98AC',450,'right');text(subjects[i],263,y+55,19,C.ink,520);text(previews[i],263,y+80,15,'#8794AA',420);ctx.restore();}
  line([[780,76],[780,h]],'#E2E9F4',1);let r=ease((t-.65)/.7);ctx.save();ctx.globalAlpha=r;ctx.translate(0,(1-r)*35);
  ellipse(839,126,23,23,'#CCE0FF');text('A',839,126,20,C.blue,650,'center');text('Alex Morgan',878,118,20,C.ink,650);text('alex@studio.co',878,144,14,'#8591A5',420);pill('TO YOU',1244,106,125);
  text('Let’s build something great.',812,215,31,C.ink,600);text('Hey Hieu,',812,281,20,C.ink,500);text('Your next chapter starts with a hello.',812,327,20,'#758399',420);text('Looking forward to working together.',812,365,20,'#758399',420);
  rr(811,405,445,62,14,'#F4F7FC','#E2EAF5');rr(825,417,37,37,9,'#E0EAFF');text('↓',843,435,22,C.blue,600,'center');text('Project brief.pdf',880,437,17,C.ink,540);text('2.4 MB',1234,437,13,'#8593AD',400,'right');
  rr(810,496,113,44,12,C.blue);text('↩ Reply',866,518,17,'#FFF',500,'center');text('Forward  ↗',950,518,17,'#8391A9',500);ctx.restore();ctx.restore();
}
export function sceneInbox(t,global) {
  background(global);chrome(1,2);reveal('Meet your new inbox.',102,205,85,t,.02);pill('SEND. RECEIVE. DONE.',1438,177,367);
  const p=spring(t/.85);ctx.save();ctx.translate(105+(1-p)*-190,309+(1-p)*420);ctx.translate(710,293);ctx.rotate((1-p)*-.09+.004*Math.sin(t));ctx.scale(.98+.02*p,.98+.02*p);ctx.translate(-710,-293);inbox(t);ctx.restore();
  robot(1660,708+180*(1-ease((t-.25)/.7)),.59,global,2);
  let arrive=ease((t-.8)/.55);ctx.save();ctx.globalAlpha=arrive*(1-smooth((t-2.9)/.5));ctx.translate(1270+(1-arrive)*480,282-(1-arrive)*120);ctx.rotate((1-arrive)*.25);shadow(.15,40,16);rr(0,0,393,77,19,'#FFF','#D5E2F5');clearShadow();ellipse(40,38,23,23,'#E7F8F0');check(40,38,22,'#1F9E71');text('You’ve got good company.',77,30,18,C.ink,600);text('New message · hello@mailflare.co',77,53,14,'#8797B3',420);ctx.restore();
  const sent=ease((t-2.15)/.5);ctx.save();ctx.globalAlpha=sent;rr(1200,820+(1-sent)*70,268,63,18,'#155BFF');text('Message sent',1263,852+(1-sent)*70,21,'#FFF',550);check(1234,852+(1-sent)*70,24,'#B0EDFF');ctx.restore();
  reveal('Your domain. Every conversation.',107,962,28,t,.85,'#6C7D9B',450);
  pill('ONE CLEAN WORKSPACE',1466,926,344);
}
export function teamCard(x,y,address,role,initial,color,t,delay,alias=false) {
  let p=spring((t-delay)/.65);if(p<=0)return;ctx.save();ctx.translate(x+(x<800?-120:120)*(1-p),y+40*(1-p));ctx.scale(.93+.07*p,.93+.07*p);ctx.globalAlpha=clamp(p);shadow(.25,45,22);rr(0,0,440,153,25,gradient(0,0,440,153,['#1D3359','#142544']),'#435B83',1.5);clearShadow();
  ellipse(53,55,29,29,color);text(initial,53,55,23,'#FFF',650,'center');text(address,100,53,34,'#EDF6FF',580);text('mailflare.co',100,89,18,'#7E9FCF',450);rr(24,113,200,1,0,'#365075');text(role,27,134,15,'#97B5DD',500);ellipse(402,131,5,5,C.green);text(alias?'ALIAS':'ACTIVE',388,132,11,'#7CD3B0',600,'right');ctx.restore();
}
export function wire(x,y,x2,y2,t,delay) {
  let p=ease((t-delay)/.75);ctx.save();ctx.globalAlpha=p;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo((x+x2)/2,y,(x+x2)/2,y2,x2,y2);ctx.strokeStyle='#3D67A8';ctx.lineWidth=2;ctx.stroke();
  const q=(t*.55+delay)%1;let xx=(1-q)**3*x+3*(1-q)**2*q*(x+x2)/2+3*(1-q)*q*q*(x+x2)/2+q**3*x2,yy=(1-q)**3*y+3*(1-q)**2*q*y+3*(1-q)*q*q*y2+q**3*y2;
  ctx.shadowColor='#71DDFF';ctx.shadowBlur=18;ellipse(xx,yy,5,5,'#91E6FF');ctx.restore();
}
export function sceneTeam(t,global) {
  background(global,true);chrome(1,3,true);reveal('One domain. Your whole team.',960,213,80,t,.03,'#FFF',610,'center');
  reveal('Built for individuals, developers, startups, and teams.',960,287,26,t,.18,'#8CA9D5',450,'center');
  wire(590,434,745,480,t,.2);wire(590,665,745,490,t,.42);wire(1330,434,1175,480,t,.35);wire(1330,665,1175,490,t,.57);
  const p=spring((t-.13)/.7);ctx.save();ctx.translate(960,482);ctx.scale(p,p);shadow(.45,75,20);rr(-215,-54,430,108,27,gradient(-215,-54,215,54,['#3277FF','#0E48D6']),'#669FFF',2);clearShadow();envelope(-157,0,52);text('mailflare.co',-108,1,39,'#FFF',580);check(175,0,23,'#99EDCC');ctx.restore();
  teamCard(149,357,'hello@','Primary mailbox','H','#4085DF',t,.15);teamCard(149,588,'support@','Routes to your support team','S','#8D70DE',t,.43,true);
  teamCard(1330,357,'hieu@','Owner · full access','H','#269889',t,.29);teamCard(1330,588,'team@','Shared mailbox','T','#CB8755',t,.57);
  robot(960,743,.52,global,t>2?1:2,true);
  const items=['Domains','Users','Aliases','Permissions'];for(let i=0;i<4;i++){let a=ease((t-.8-i*.14)/.5);ctx.save();ctx.globalAlpha=a;pill(items[i],545+i*211,911+(1-a)*35,194,true,true);ctx.restore();}
  reveal('Simple setup. No mail-server maze.',960,995,21,t,1.85,'#B6D1F9',450,'center');
  spark(1222,684,17,'#63C7FF',t*.35);spark(705,365,12,'#63C7FF',t*-.45);
}
export function sceneHero(t,global) {
  background(global,false,true);chrome(1,4,true);
  ctx.save();ctx.globalAlpha=.11;ctx.strokeStyle='#D7EEFF';ctx.lineWidth=1.5;for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(950,540,450+i*185,270+i*115,-.18,0,Math.PI*2);ctx.stroke();}ctx.restore();
  let phraseOut=1-smooth((t-1.2)/.45);ctx.save();ctx.globalAlpha=phraseOut;reveal('Your domain.',960,427,129,t,.04,'#FFF',630,'center');reveal('Your email.',960,570,129,t,.22,'#A8D8FF',630,'center');ctx.restore();
  let p=spring((t-1.22)/.9);if(p>0){ctx.save();ctx.globalAlpha=clamp(p);ctx.translate(930,473+(1-p)*70);ctx.scale(.88+.12*p,.88+.12*p);shadow(.22,60,20);rr(-483,-83,163,163,42,'#FFF');clearShadow();envelope(-402,1,121);text('Mailflare',-273,4,152,'#FFF',660);ctx.restore();}
  reveal('Professional email for individuals and teams.',960,652,37,t,1.52,'#D8E8FF',450,'center');
  let url=ease((t-1.75)/.55);ctx.save();ctx.globalAlpha=url;shadow(.1,40,15);rr(788,750+(1-url)*40,344,81,40,'#FFFFFF');clearShadow();text('mailflare.co',947,791+(1-url)*40,30,C.blue,600,'center');arrow(1090,791+(1-url)*40,23);ctx.restore();
  const rp=ease((t-1.58)/.75);robot(1655+350*(1-rp),750,.51,global,1,true);
  for(let i=0;i<6;i++){let a=i*Math.PI/3+global*.16;let dist=340+80*i/6;let xx=960+Math.cos(a)*dist*1.55,yy=515+Math.sin(a)*dist;ctx.save();ctx.globalAlpha=.2*clamp(p);spark(xx,yy,8+i%3*3,'#DDF4FF',a);ctx.restore();}
  reveal('YOUR BUSINESS. BEAUTIFULLY ADDRESSED.',960,926,18,t,2.1,'#A5CBFF',550,'center');
}
export function transition(t,at) {
  const u=(t-at)/.52;if(u<0||u>1)return;
  ctx.save();ctx.translate(lerp(-2500,2600,smooth(u)),0);ctx.transform(1,0,-.3,1,0,0);
  const g=gradient(0,0,1100,0,['#2B79FF00','#8BE3FF','#FFFFFF','#195BFF','#175BFF00']);ctx.fillStyle=g;ctx.fillRect(0,-40,1100,H+80);ctx.restore();
}
export function frame(t) {
  ctx.resetTransform();ctx.globalAlpha=1;ctx.filter='none';clearShadow();
  if(t<3)sceneIntro(t);else if(t<7)sceneInbox(t-3,t);else if(t<11)sceneTeam(t-7,t);else sceneHero(t-11,t);
  transition(t,2.75);transition(t,6.75);transition(t,10.75);
  const g=ctx.createRadialGradient(960,520,450,960,520,1170);g.addColorStop(0,'#08142F00');g.addColorStop(1,'#08142F13');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
export async function render() {
  const out=join(ROOT,'picture.mp4');
  const encoder=spawn('ffmpeg',['-y','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',`${FPS}`,'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',out],{stdio:['pipe','inherit','inherit']});
  const sample=createCanvas(W,H),sc=sample.getContext('2d');
  for(let n=0;n<15*FPS;n++){
    const t=n/FPS;frame(t);
    if([120,300,540,840].includes(n))writeFileSync(join(ROOT,`scene-${n}.png`),canvas.toBuffer('image/png'));
    if(n===840)writeFileSync(join(ROOT,'poster.png'),canvas.toBuffer('image/png'));
    // Two shutter samples keep fast entrances and whip transitions soft at 60 fps.
    sc.globalAlpha=1;sc.drawImage(canvas,0,0);frame(t+1/FPS*.38);sc.globalAlpha=.42;sc.drawImage(canvas,0,0);
    if(!encoder.stdin.write(Buffer.from(sc.getImageData(0,0,W,H).data)))await once(encoder.stdin,'drain');
    if(n%120===0)process.stdout.write(`Rendered ${n}/${15*FPS} frames\n`);
  }
  encoder.stdin.end();const [code]=await once(encoder,'close');if(code!==0)throw new Error(`Encoder exited ${code}`);process.stdout.write('Picture render complete.\n');
}
