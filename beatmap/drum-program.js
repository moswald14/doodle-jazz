(function(root){
 'use strict';
 const DEFAULT='LABEL "groove"\nPLAY 1 x2\nGOTO "groove" x1\nEND';
 function draft(value){if(value===undefined)return {source:DEFAULT,loop:true};if(!value||typeof value.source!=='string'||value.source.length>4096||typeof value.loop!=='boolean')throw new Error('Invalid drum program.');return {source:value.source,loop:value.loop};}
 function compile(source,bars){
  if(typeof source!=='string'||source.length>4096)throw new Error('Keep the program under 4,096 characters.');
  if(!Number.isInteger(bars)||bars<1||bars>8)throw new Error('Choose one to eight source measures.');
  const lines=source.split(/\r?\n/);if(lines.length>64)throw new Error('Use at most 64 program lines.');
  const code=[],labels=new Map();
  lines.forEach((raw,i)=>{const line=raw.trim();if(!line||line.startsWith('#'))return;let m;
   const fail=()=>{throw new Error('Line '+(i+1)+': use LABEL "name", PLAY 1 x2, GOTO "name" x3, or END.');};
   if((m=line.match(/^LABEL\s+"([\w -]{1,24})"$/i))){const name=m[1].trim();if(!name||labels.has(name))throw new Error('Line '+(i+1)+': label is empty or already used.');labels.set(name,code.length);code.push({op:'label',line:i+1});}
   else if((m=line.match(/^PLAY\s+(\d+)(?:\s+x(\d+))?$/i))){const measure=+m[1],count=+(m[2]||1);if(measure<1||measure>bars||count<1||count>16)throw new Error('Line '+(i+1)+': PLAY needs an existing measure and 1–16 repeats.');code.push({op:'play',measure,count,line:i+1});}
   else if((m=line.match(/^GOTO\s+"([\w -]{1,24})"\s+x(\d+)$/i))){const count=+m[2];if(count<1||count>32)throw new Error('Line '+(i+1)+': GOTO needs 1–32 extra visits.');code.push({op:'goto',name:m[1].trim(),count,line:i+1});}
   else if(/^END$/i.test(line))code.push({op:'end',line:i+1});else fail();
  });
  for(const c of code)if(c.op==='goto'&&!labels.has(c.name))throw new Error('Line '+c.line+': no label named "'+c.name+'".');
  let pc=0,budget=4096;const visits=new Map(),sequence=[];
  while(pc<code.length){if(--budget<0)throw new Error('This program runs too many jumps.');const c=code[pc];if(c.op==='end')break;
   if(c.op==='play'){for(let n=0;n<c.count;n++)sequence.push({measure:c.measure,line:c.line});if(sequence.length>64)throw new Error('Keep the finished loop to 64 measures or fewer.');}
   if(c.op==='goto'&&(visits.get(pc)||0)<c.count){visits.set(pc,(visits.get(pc)||0)+1);pc=labels.get(c.name);continue;}pc++;
  }
  if(!sequence.length)throw new Error('Add a PLAY instruction before END.');return sequence;
 }
 function euclidean(hits,steps,rotation=0){if(!Number.isInteger(hits)||!Number.isInteger(steps)||hits<1||hits>steps||steps>32||!Number.isInteger(rotation))throw new Error('Choose 1–32 steps and no more hits than steps.');return Array.from({length:steps},(_,i)=>{const n=((i-rotation)%steps+steps)%steps;return (n*hits)%steps<hits?1:0;});}
 function wav8(samples,rate=22050){
  if(!Number.isInteger(rate)||rate<8000||rate>192000||!samples?.length||samples.length>rate*480)throw new Error('Invalid 8-bit WAV length or rate.');const length=samples.length,pad=length%2,buffer=new ArrayBuffer(44+length+pad),v=new DataView(buffer),str=(i,s)=>{for(let j=0;j<s.length;j++)v.setUint8(i+j,s.charCodeAt(j));};
  str(0,'RIFF');v.setUint32(4,36+length+pad,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate,true);v.setUint16(32,1,true);v.setUint16(34,8,true);str(36,'data');v.setUint32(40,length,true);
  for(let i=0;i<length;i++){if(!Number.isFinite(samples[i]))throw new Error('Invalid audio sample.');v.setUint8(44+i,Math.max(0,Math.min(255,Math.round(samples[i]*128+128))));}return buffer;
 }
 const api={DEFAULT,draft,compile,euclidean,wav8};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DrumProgram=api;
})(typeof globalThis!=='undefined'?globalThis:this);
