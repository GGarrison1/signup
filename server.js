'use strict';
const express=require('express');
const Database=require('better-sqlite3');
const crypto=require('crypto');
const path=require('path');
const fs=require('fs');
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'60kb'}));
const dir=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(dir,{recursive:true});
const db=new Database(path.join(dir,'scheduler.sqlite'));db.pragma('journal_mode = WAL');db.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, json TEXT NOT NULL)');
const day=s=>{let d=new Date(s+'T12:00:00Z');return Number.isNaN(d.getTime())?null:d};
const iso=d=>d.toISOString().slice(0,10);const shift=(s,n)=>{let d=day(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const today=iso(new Date()), monday=shift(today,-((day(today).getUTCDay()+6)%7));
const sample={start:monday,end:shift(monday,18),first:540,last:960,topics:[{id:'intro',title:'Introduction and course objectives',duration:30},{id:'phys',title:'Pulmonary physiology',duration:60},{id:'reason',title:'Clinical reasoning',duration:60},{id:'case',title:'Interactive case discussion',duration:30}],placements:{},blocks:[]};
db.prepare('INSERT OR IGNORE INTO state(id,version,json) VALUES(1,0,?)').run(JSON.stringify(sample));
const read=()=>{let x=db.prepare('SELECT * FROM state WHERE id=1').get();return {version:x.version,...JSON.parse(x.json)}};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&day(s)&&iso(day(s))===s;
const weekday=s=>{let n=day(s).getUTCDay();return n!==0&&n!==6};
const adminPassword=process.env.ADMIN_PASSWORD;
if(!adminPassword||adminPassword.length<12){console.error('Set ADMIN_PASSWORD to a strong password of at least 12 characters.');process.exit(1)}
function isAdmin(req){let a=Buffer.from(req.get('x-admin-password')||''),b=Buffer.from(adminPassword);return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function ensureAdmin(req){if(!isAdmin(req))throw Error('Administrator password required or incorrect.')}
function assert(x,message){if(!x)throw Error(message)}
function topic(s,id){return s.topics.find(t=>t.id===id)}
function validSlot(s,date,time,duration,except){if(!validDate(date)||!weekday(date)||date<s.start||date>s.end||!Number.isInteger(time)||time<s.first||time%15!==0||time+duration>s.last||time<780&&time+duration>720)return false;
 for(let b of s.blocks)if(b.date===date&&(b.time==='all'||(time<b.time+30&&time+duration>b.time)))return false;
 for(let [id,p] of Object.entries(s.placements)){if(id===except||p.date!==date)continue;let d=topic(s,id)?.duration||30;if(time<p.time+d&&time+duration>p.time)return false}return true}
app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next()});
app.get('/api/state',(req,res)=>res.json(read()));
app.post('/api/action',(req,res)=>{try{let {version,action,payload={}}=req.body||{};assert(Number.isInteger(version),'Missing schedule version.');assert(typeof action==='string','Missing action.');let result=db.transaction(()=>{let row=db.prepare('SELECT * FROM state WHERE id=1').get();if(row.version!==version)return {conflict:true};let s=JSON.parse(row.json);let p=payload;
 switch(action){
 case 'place':{let t=topic(s,p.id);assert(t,'Lecture topic not found.');let old=s.placements[p.id];let name=old?.name||String(p.name||'').trim();assert(name.length>0&&name.length<=80,'Enter a volunteer name (80 characters maximum).');assert(validSlot(s,p.date,p.time,t.duration,p.id),'Time is unavailable, blocked, or conflicts with another lecture.');s.placements[p.id]={date:p.date,time:p.time,name};break}
 case 'remove':{assert(s.placements[p.id],'Lecture is not scheduled.');delete s.placements[p.id];break}
 case 'course':{ensureAdmin(req);assert(validDate(p.start)&&validDate(p.end)&&p.start<=p.end,'Invalid date range.');assert(Number.isInteger(p.first)&&Number.isInteger(p.last)&&p.first>=0&&p.last<=1440&&p.first<p.last&&p.first%15===0&&p.last%15===0,'Invalid teaching hours.');s.start=p.start;s.end=p.end;s.first=p.first;s.last=p.last;for(let [id,v] of Object.entries(s.placements))assert(validSlot(s,v.date,v.time,topic(s,id).duration,id),'Move existing lectures before changing course settings.');assert(s.blocks.every(b=>b.date>=s.start&&b.date<=s.end&&weekday(b.date)&& (b.time==='all'||b.time>=s.first&&b.time<s.last)),'Remove out-of-range blocks before changing course settings.');break}
 case 'topic':{ensureAdmin(req);let title=String(p.title||'').trim(),duration=Number(p.duration);assert(title.length>0&&title.length<=160,'Lecture title must be 1–160 characters.');assert(Number.isInteger(duration)&&[30,60,90,120].includes(duration),'Duration must be 30, 60, 90, or 120 minutes.');s.topics.push({id:crypto.randomUUID(),title,duration});break}
 case 'deleteTopic':{ensureAdmin(req);assert(topic(s,p.id),'Topic not found.');assert(!s.placements[p.id],'Remove the lecture from the calendar first.');s.topics=s.topics.filter(t=>t.id!==p.id);break}
 case 'block':{ensureAdmin(req);assert(validDate(p.date)&&weekday(p.date)&&p.date>=s.start&&p.date<=s.end,'Select a weekday within the course.');assert(p.time==='all'||Number.isInteger(p.time)&&p.time>=s.first&&p.time<s.last&&p.time%30===0,'Invalid block time.');let start=p.time==='all'?s.first:p.time,end=p.time==='all'?s.last:p.time+30;for(let [id,v] of Object.entries(s.placements))assert(v.date!==p.date||v.time>=end||v.time+topic(s,id).duration<=start,'Move scheduled lectures before blocking this time.');s.blocks.push({id:crypto.randomUUID(),date:p.date,time:p.time,reason:String(p.reason||'Alternative activity').trim().slice(0,120)});break}
 case 'unblock':{ensureAdmin(req);assert(s.blocks.some(b=>b.id===p.id),'Block not found.');s.blocks=s.blocks.filter(b=>b.id!==p.id);break}
 default:throw Error('Unknown action.');}
 db.prepare('UPDATE state SET version=?,json=? WHERE id=1').run(version+1,JSON.stringify(s));return {version:version+1,...s};})();if(result.conflict)return res.status(409).json({error:'The schedule changed. Refresh and retry.'});res.json(result)}catch(e){res.status(400).json({error:e.message})}});
app.use(express.static(path.join(__dirname,'public'),{index:'index.html'}));
app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Course Scheduler listening'));
