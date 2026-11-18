'use strict';
const measureEditing={undo:null,orderBars:0};
const measureCopy=x=>JSON.parse(JSON.stringify(x));
function measureSignature(){return JSON.stringify([drumPattern(),$('program-source').value,$('beat-name').value]);}
function measureSnapshot(){return {pattern:measureCopy(drumPattern()),selected:drum.editBar,follow:drum.follow,program:$('program-source').value,tracks:measureCopy([...drum.measureStash]),pads:measureCopy([...drum.padStash]),mods:measureCopy([...modStash])};}
function finishMeasureEdit(message){drum.cache.clear();window.resetPadHistory?.();$('beat-bars').value='0';buildDrumRows();renderBank();renderDrumTransport();clearDrumCursor();window.checkDrumProgram?.();$('beat-status').textContent=message;}
function applyMeasureOrder(order,selected,message){
 if(!Array.isArray(order)||order.length<1||order.length>8||order.some(i=>!Number.isInteger(i)||i<0||i>=drum.bars))throw new Error('Choose one to eight existing measures.');
 const snapshot=measureSnapshot(),count=drumStepCount(),p=snapshot.pattern;
 const rearrange=t=>({...t,steps:order.flatMap(i=>t.steps.slice(i*count,(i+1)*count)),...(t.modifiers?{modifiers:order.flatMap(i=>t.modifiers.slice(i*count,(i+1)*count))}:{})});
 const next=DrumDSP.validatePattern({...p,bars:order.length,tracks:p.tracks.map(rearrange),pads:p.pads.map(rearrange)});
 const program=snapshot.program.replace(/^([ \t]*PLAY[ \t]+)(\d+)([ \t]*(?:x\d+)?[ \t]*)$/gim,(line,prefix,n,suffix)=>{if(+n<1||+n>p.bars)return line;const position=order.indexOf(+n-1);return position<0?'# Removed measure: '+line.trim():prefix+(position+1)+suffix;});
 stopDrumMachine();drum.tracks=next.tracks;drum.pads=next.pads;drum.bars=next.bars;drum.editBar=clamp(selected,0,drum.bars-1);drum.follow=false;$('program-source').value=program;
 // Changed order invalidates hidden measures in this meter only.
 const key=`${drum.meter.numerator}/${drum.meter.denominator}`;drum.measureStash.delete(key);drum.padStash.delete(key);modStash.delete(key);
 measureEditing.undo={snapshot,after:measureSignature()};measureEditing.orderBars=0;finishMeasureEdit(message+' Drum hits, pad hits and modifiers travel together.');
}
function duplicateDrumMeasure(){if(drum.bars>=8){notice('Eight measures maximum. Remove a measure before duplicating.');return;}const order=Array.from({length:drum.bars},(_,i)=>i),at=drum.editBar;order.splice(at+1,0,at);applyMeasureOrder(order,at+1,'Duplicated measure '+(at+1)+' into a new measure '+(at+2)+'.');}
function moveDrumMeasure(to){if(!Number.isInteger(to)||to<0||to>=drum.bars||to===drum.editBar)return;const from=drum.editBar,order=Array.from({length:drum.bars},(_,i)=>i);order.splice(from,1);order.splice(to,0,from);applyMeasureOrder(order,to,'Moved measure '+(from+1)+' to position '+(to+1)+'.');}
function renderMeasureEditing(){
 $('beat-copy-next').disabled=drum.bars>=8;$('beat-copy-next').title='Insert a copy after this measure; later measures shift right';
 $('measure-earlier').disabled=drum.editBar===0;$('measure-later').disabled=drum.editBar>=drum.bars-1;$('measure-remove').disabled=drum.bars===1;
 const select=$('measure-position');select.innerHTML='';for(let i=0;i<drum.bars;i++)mixOption(select,String(i),String(i+1));select.value=String(drum.editBar);
 $('measure-undo').disabled=!measureEditing.undo||measureEditing.undo.after!==measureSignature();
 if(measureEditing.orderBars!==drum.bars){$('measure-order').value=Array.from({length:drum.bars},(_,i)=>i+1).join(', ');measureEditing.orderBars=drum.bars;}
}
window.renderMeasureEditing=renderMeasureEditing;
$('measure-earlier').addEventListener('click',()=>moveDrumMeasure(drum.editBar-1));$('measure-later').addEventListener('click',()=>moveDrumMeasure(drum.editBar+1));$('measure-move').addEventListener('click',()=>moveDrumMeasure(+$('measure-position').value));
$('measure-order-apply').addEventListener('click',()=>{try{const raw=$('measure-order').value.trim();if(!/^\d+(?:[\s,]+\d+)*$/.test(raw))throw new Error('Enter each measure number once, separated by commas or spaces.');const order=raw.split(/[\s,]+/).map(v=>+v-1);if(order.length!==drum.bars||new Set(order).size!==drum.bars||order.some(n=>n<0||n>=drum.bars))throw new Error('Use every current measure exactly once, for example 3, 1, 2.');applyMeasureOrder(order,order.indexOf(drum.editBar),'Measure order updated.');}catch(e){$('beat-status').textContent=e.message;}});
$('measure-remove').addEventListener('click',()=>{if(drum.bars<=1)return;const at=drum.editBar;applyMeasureOrder(Array.from({length:drum.bars},(_,i)=>i).filter(i=>i!==at),Math.min(at,drum.bars-2),'Removed measure '+(at+1)+'. Undo restores it. Loop-program PLAY lines for that measure are commented out.');});
$('measure-clear').addEventListener('click',()=>{const snapshot=measureSnapshot(),at=drum.editBar*drumStepCount();stopDrumMachine();for(const t of [...drum.tracks,...drum.pads]){t.steps.fill(0,at,at+drumStepCount());t.modifiers?.fill('',at,at+drumStepCount());}drum.follow=false;measureEditing.undo={snapshot,after:measureSignature()};finishMeasureEdit('Cleared the selected measure. Undo restores its drum and pad hits.');});
$('measure-undo').addEventListener('click',()=>{const undo=measureEditing.undo;if(!undo)return;if(undo.after!==measureSignature()){notice('The beat changed after that measure edit; undo is no longer available.');renderMeasureEditing();return;}const s=undo.snapshot;stopDrumMachine();Object.assign(drum,{tracks:s.pattern.tracks,pads:s.pattern.pads,bars:s.pattern.bars,meter:s.pattern.meter,editBar:s.selected,follow:s.follow,measureStash:new Map(s.tracks),padStash:new Map(s.pads)});modStash.clear();for(const [key,value]of s.mods)modStash.set(key,value);$('program-source').value=s.program;measureEditing.undo=null;measureEditing.orderBars=0;finishMeasureEdit('Undid the measure edit.');});
renderMeasureEditing();
