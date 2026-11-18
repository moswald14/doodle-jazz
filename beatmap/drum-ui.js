'use strict';
const BANK_KEY='doodle-jazz-beatmap-waves-v1';
const waveBank={waves:WaveLibrary.stockWaves(),selected:'stock-sine',cache:new Map(),removed:null,storageOK:true};
try{const saved=localStorage.getItem(BANK_KEY);if(saved)waveBank.waves=WaveLibrary.merge(waveBank.waves,WaveLibrary.validateBundle(JSON.parse(saved)));}catch(error){waveBank.storageOK=false;}
const drum={tracks:DrumDSP.defaultTracks(),pads:DrumDSP.defaultPads(),padStash:new Map(),bpm:110,swing:0,bars:1,meter:{numerator:4,denominator:4},editBar:0,follow:true,measureStash:new Map(),volume:.45,selected:0,playing:false,pending:false,token:0,auditionToken:0,timer:null,nextTime:0,step:0,queue:[],current:-1,bus:null,context:null,cache:new Map(),voices:new Set()};
window.dotDrum=drum;window.dotWaveBank=waveBank;
const drumRows=[];
function selectedWave(){return waveBank.waves.find(w=>w.id===waveBank.selected)||waveBank.waves[0];}
function waveSignal(id){if(!waveBank.cache.has(id)){const wave=waveBank.waves.find(w=>w.id===id);if(!wave)throw new Error('Choose a waveform from the library.');waveBank.cache.set(id,WaveLibrary.signal(wave));}return waveBank.cache.get(id);}
function saveBankStorage(){try{localStorage.setItem(BANK_KEY,JSON.stringify({kind:'dot-wave-library',version:1,waves:waveBank.waves}));waveBank.storageOK=true;}catch(e){waveBank.storageOK=false;}$('bank-storage').textContent=waveBank.storageOK?'Library saved in this browser. Export a backup to keep a separate copy.':'Browser storage is unavailable. Export your library to keep these waves.';}
function fillWaveSelect(select,value){select.innerHTML='';for(const wave of waveBank.waves){const option=document.createElement('option');option.value=wave.id;option.textContent=wave.name;select.append(option);}select.value=value;}
function renderBank(){
 window.refreshMelodySounds?.();
 if(!waveBank.waves.some(w=>w.id===waveBank.selected))waveBank.selected=waveBank.waves[0].id;
 fillWaveSelect($('bank-select'),waveBank.selected);$('bank-count').textContent=`${waveBank.waves.length} waves · ${waveBank.waves.filter(w=>!w.id.startsWith('stock-')).length} saved`;
 const wave=selectedWave(),signal=waveSignal(wave.id);let path='';for(let i=0;i<=200;i++)path+=`${i?'L':'M'}${i},${(21-StudioDSP.sample(signal.table,i/200)*17).toFixed(2)} `;
 $('bank-path').setAttribute('d',path);$('bank-preview').setAttribute('aria-label',`${wave.name} saved waveform`);$('bank-remove').disabled=wave.id.startsWith('stock-');$('bank-undo').hidden=!waveBank.removed;
 drumRows.forEach((row,i)=>fillWaveSelect(row.wave,drum.tracks[i].waveId));
 if(!waveBank.storageOK)$('bank-storage').textContent='Browser storage is unavailable. Export your library to keep these waves.';
 window.refreshPatchWaveSelectors?.();window.renderWaveformBox?.();window.refreshDrumPads?.();window.refreshMidiMixSources?.();window.refreshContinuitySources?.();
}
function bankId(){return `wave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;}
function ensureDrumBus(e){if(drum.context!==e.context){drum.context=e.context;drum.bus=e.context.createGain();drum.bus.gain.value=drum.volume;drum.bus.connect(e.input);drum.cache.clear();}return drum.bus;}
function hitKey(track){return JSON.stringify([track.id,track.waveId,track.pitch,track.decay,track.sweep,track.noise,track.tone,track.level]);}
function getHitBuffer(e,track){const key=hitKey(track);if(!drum.cache.has(key)){const samples=DrumDSP.renderHit(waveSignal(track.waveId),{...track,mute:false},e.context.sampleRate),buffer=e.context.createBuffer(1,samples.length,e.context.sampleRate);buffer.copyToChannel(samples,0);drum.cache.set(key,buffer);if(drum.cache.size>48)drum.cache.delete(drum.cache.keys().next().value);}return drum.cache.get(key);}
function triggerDrumHit(e,track,at,velocity=1){
 if(track.mute||velocity<=0)return;
 const bus=ensureDrumBus(e),buffer=getHitBuffer(e,track),source=e.context.createBufferSource(),gain=e.context.createGain();source.buffer=buffer;gain.gain.value=velocity;
 source.connect(gain);gain.connect(bus);const voice={source,gain,at};drum.voices.add(voice);
 source.onended=()=>{source.disconnect();gain.disconnect();drum.voices.delete(voice);};
 source.start(at);source.stop(at+buffer.duration+.01);
 if(drum.voices.size>128){const oldest=drum.voices.values().next().value;try{oldest.source.stop(e.context.currentTime);}catch(err){}drum.voices.delete(oldest);}
}
function renderDrumTransport(){
 $('beat-play').textContent=drum.playing?'■ Stop beat':drum.pending?'Cancel start':'▶ Play beat';$('beat-play').setAttribute('aria-pressed',String(drum.playing));
 $('beat-bpm').value=drum.bpm;$('beat-swing').value=Math.round(drum.swing*100);$('beat-swing-value').textContent=`${Math.round(drum.swing*100)}%`;$('beat-volume').value=Math.round(drum.volume*100);$('beat-volume-value').textContent=`${Math.round(drum.volume*100)}%`;
 renderMeasureControls();
}
function drumStepCount(){return DrumDSP.stepsPerBar(drum.meter);}
function clearDrumCursor(){drum.current=-1;$('beat-position').textContent=`M1 / ${drum.bars} · 01 / ${drumStepCount()}`;drumRows.forEach(row=>row.steps.forEach(button=>button.classList.toggle('is-current',false)));}
function renderMeasureControls(){
 $('beat-measures').value=drum.bars;$('beat-meter').value=`${drum.meter.numerator}/${drum.meter.denominator}`;$('beat-follow').checked=drum.follow;
 $('beat-measure-label').textContent=`EDITING MEASURE ${drum.editBar+1} OF ${drum.bars}`;$('beat-chip').textContent=`${drum.bars} MEASURE${drum.bars===1?'':'S'} · ${drum.meter.numerator}/${drum.meter.denominator}`;
 $('beat-measure-prev').disabled=drum.editBar===0;$('beat-measure-next').disabled=drum.editBar===drum.bars-1;$('beat-copy-next').disabled=drum.bars>=8;
 $('beat-add-measure').disabled=drum.bars>=8;$('beat-add-measure').title=drum.bars>=8?'Eight measures maximum per beatMAP':'Append a blank measure and edit it';
 window.renderMeasureEditing?.();
 const pager=$('beat-measure-pages');pager.innerHTML='';for(let i=0;i<drum.bars;i++){const button=document.createElement('button');button.textContent=String(i+1);button.setAttribute('aria-label',`Edit measure ${i+1}`);button.setAttribute('aria-pressed',String(i===drum.editBar));button.addEventListener('click',()=>selectDrumMeasure(i));pager.append(button);}
}
function selectDrumMeasure(index,automatic=false){drum.editBar=clamp(index,0,drum.bars-1);if(!automatic)drum.follow=false;renderMeasureControls();renderDrumRows();window.refreshDrumPads?.();}
function stashDrumMeasures(){window.stashBeatModifiers?.();const padKey=`${drum.meter.numerator}/${drum.meter.denominator}`,oldPads=drum.padStash.get(padKey)||[];drum.padStash.set(padKey,drum.pads.map((p,i)=>{const steps=oldPads[i]?[...oldPads[i]]:[];p.steps.forEach((v,j)=>steps[j]=v);return steps;}));const key=`${drum.meter.numerator}/${drum.meter.denominator}`,prior=drum.measureStash.get(key)||[];drum.measureStash.set(key,drum.tracks.map((track,i)=>{const steps=prior[i]?[...prior[i]]:[];track.steps.forEach((value,index)=>steps[index]=value);return steps;}));}
function resizeDrumMeasures(bars,meter){
 const current=drumPattern(),next=DrumDSP.resizePattern(current,{bars,meter});stashDrumMeasures();
 const key=`${next.meter.numerator}/${next.meter.denominator}`,saved=drum.measureStash.get(key);
 if(saved)next.tracks.forEach((track,i)=>track.steps=track.steps.map((value,index)=>saved[i]?.[index]??value));
 const keptPads=drum.padStash.get(key);if(keptPads&&next.pads)next.pads.forEach((p,i)=>p.steps=p.steps.map((v,j)=>keptPads[i]?.[j]??v));window.restoreBeatModifiers?.(next);stopDrumMachine();window.resetPadHistory?.();drum.tracks=next.tracks;drum.pads=next.pads||DrumDSP.defaultPads(next.bars*DrumDSP.stepsPerBar(next.meter));drum.bars=next.bars;drum.meter=next.meter;drum.editBar=Math.min(drum.editBar,drum.bars-1);$('beat-bars').value='0';drum.cache.clear();buildDrumRows();renderBank();renderDrumTransport();clearDrumCursor();
 $('beat-status').textContent='Measure layout updated. Shortened measures and other time signatures are kept in this visit; expand or switch back to restore them.';
}
function addDrumMeasure(){
 if(drum.bars>=8)return;
 const nextIndex=drum.bars;
 resizeDrumMeasures(drum.bars+1,drum.meter);
 // Explicit Add starts a blank measure; the length selector still restores
 // stashed measures when expanding a previously shortened pattern.
 const from=nextIndex*drumStepCount();
 for(const track of [...drum.tracks,...drum.pads]){track.steps.fill(0,from);track.modifiers?.fill('',from);}
 selectDrumMeasure(nextIndex);
 $('beat-status').textContent=`Added blank measure ${drum.bars}. Earlier measures are kept. Place hits here or select any measure and use Duplicate.`;
}
function stopDrumMachine(){
 window.stopDrumProgram?.();
 window.finishPadRecording?.();
 drum.token++;drum.auditionToken++;drum.playing=false;drum.pending=false;clearTimeout(drum.timer);drum.timer=null;drum.queue=[];
 if(drum.context){const now=drum.context.currentTime;for(const voice of drum.voices){try{voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.005);voice.source.stop(now+.025);}catch(e){}}}
 drum.voices.clear();clearDrumCursor();renderDrumTransport();$('beat-status').textContent='Stopped. Press play to start from step 1.';
}
window.stopDrumMachine=stopDrumMachine;
function scheduleDrums(token){
 if(!drum.playing||token!==drum.token||!engine)return;
 const now=engine.context.currentTime;
 if(drum.nextTime<now-.1){
  // An expensive live edit may delay this timer. Skip missed hits while keeping
  // the shared origin, rather than moving the beat away from the other loops.
  const unit=60/drum.bpm/4,target=now+.025;
  drum.scheduledStep=Math.max(drum.scheduledStep,Math.floor((target-drum.started)/unit));
  const time=()=>drum.started+(drum.scheduledStep+(drum.scheduledStep%2?drum.swing:0))*unit;
  while(time()<target)drum.scheduledStep++;
  drum.nextTime=time();drum.step=drum.scheduledStep%(drum.bars*drumStepCount());
 }
 let scheduled=0;
 while(drum.nextTime<now+.12&&scheduled++<8){
  const step=drum.step;for(const track of DrumDSP.allTracks(drumPattern()))if(track.steps[step]>0&&window.shouldSchedulePad?.(track,drum.scheduledStep)!==false)for(const hit of DrumDSP.hitEvents(track,step,DrumDSP.stepSeconds(drum.bpm,drum.swing,step)))triggerDrumHit(engine,hit.track,drum.nextTime+hit.offset,hit.velocity);
  drum.queue.push({step,time:drum.nextTime});drum.nextTime+=DrumDSP.stepSeconds(drum.bpm,drum.swing,step);drum.step=(step+1)%(drum.bars*drumStepCount());drum.scheduledStep++;
 }
 drum.timer=setTimeout(()=>scheduleDrums(token),25);
}
async function toggleDrums(){
 if(drum.playing||drum.pending){stopDrumMachine();return;}
 window.stopDrumProgram?.();drum.bpm=window.studioTempo?.(drum.bpm)??drum.bpm;
 const token=++drum.token;drum.pending=true;renderDrumTransport();
 try{const e=await ensureAudio();if(token!==drum.token)return;ensureDrumBus(e);for(const track of DrumDSP.allTracks(drumPattern()))getHitBuffer(e,track);drum.step=0;drum.scheduledStep=0;window.resetPadSchedule?.();drum.queue=[];drum.pending=false;drum.playing=true;renderDrumTransport();$('beat-status').textContent='Playing. Edit steps and hit controls live.';window.studioSchedule(at=>{if(token!==drum.token)return;drum.nextTime=at;drum.started=at;scheduleDrums(token);});}
 catch(error){if(token!==drum.token)return;stopDrumMachine();$('beat-status').textContent=error.message;}
}
window.drumFrame=()=>{
 if(!drum.playing||!engine)return;const now=engine.context.currentTime;
 let current=null;while(drum.queue.length&&drum.queue[0].time<=now)current=drum.queue.shift().step;
 if(current!==null&&current!==drum.current){drum.current=current;const count=drumStepCount(),bar=Math.floor(current/count);$('beat-position').textContent=`M${bar+1} / ${drum.bars} · ${String(current%count+1).padStart(2,'0')} / ${count}`;if(drum.follow&&bar!==drum.editBar)selectDrumMeasure(bar,true);renderDrumRows();}
};
async function previewDrumHit(){
 const token=++drum.auditionToken;
 try{const e=await ensureAudio();if(token!==drum.auditionToken)return;triggerDrumHit(e,{...drum.tracks[drum.selected],mute:false},e.context.currentTime+.01,1);}
 catch(error){notice(error.message);}
}
function renderDrumRows(){drumRows.forEach((row,i)=>{const track=drum.tracks[i],offset=drum.editBar*drumStepCount();row.container.classList.toggle('selected',i===drum.selected);row.name.setAttribute('aria-pressed',String(i===drum.selected));row.mute.setAttribute('aria-pressed',String(track.mute));row.mute.textContent=track.mute?'OFF':'ON';row.mute.setAttribute('aria-label',`${track.mute?'Unmute':'Mute'} ${track.name}`);row.wave.value=track.waveId;row.steps.forEach((button,step)=>{const velocity=track.steps[offset+step];button.setAttribute('data-velocity',String(velocity));button.setAttribute('aria-pressed',String(velocity>0));button.setAttribute('aria-label',`${track.name}, measure ${drum.editBar+1}, step ${step+1}, ${velocity===0?'off':velocity===1?'accent':'hit'}`);button.classList.toggle('is-current',drum.current===offset+step);button.textContent=window.beatModifierLabel?.(track,offset+step)||(velocity===1?'•':'');button.title=track.modifiers?.[offset+step]?'Modifier: '+track.modifiers[offset+step]:'Click: off → hit → accent';});});}
const hitFields={pitch:{scale:1,format:v=>`${v} Hz`},decay:{scale:1000,format:v=>`${Math.round(v*1000)} ms`},sweep:{scale:1,format:v=>`${v} st`},noise:{scale:100,format:v=>`${Math.round(v*100)}%`},tone:{scale:1,format:v=>`${v} Hz`},level:{scale:100,format:v=>`${Math.round(v*100)}%`}};
function renderHitShaper(){const track=drum.tracks[drum.selected];$('shaper-name').textContent=`${track.name} · ${waveBank.waves.find(w=>w.id===track.waveId)?.name||'Wave'}`;for(const [key,config]of Object.entries(hitFields)){$(`hit-${key}`).value=key==='pitch'?track[key]:Math.round(track[key]*config.scale);$(`hit-${key}-value`).textContent=config.format(track[key]);}window.renderDrumNotes?.();renderDrumRows();}
function buildDrumRows(){
 const grid=$('drum-sequencer');grid.innerHTML='';drumRows.length=0;const count=drumStepCount(),columns=`110px 150px 36px repeat(${count},minmax(24px,1fr))`;
 grid.style.minWidth=`${Math.max(700,330+count*29)}px`;
 const heading=document.createElement('div');heading.className='step-heading';heading.style.gridTemplateColumns=columns;const caption=document.createElement('span');caption.textContent='SELECT A VOICE / SAVED WAVE';heading.append(caption);for(let step=0;step<count;step++){const label=document.createElement('span');label.textContent=String(step+1);heading.append(label);}grid.append(heading);
 drum.tracks.forEach((track,i)=>{
  const row=document.createElement('div');row.className='drum-row';row.style.gridTemplateColumns=columns;const name=document.createElement('button');name.className='drum-name';name.textContent=track.name;name.setAttribute('aria-label',`Shape ${track.name}`);name.addEventListener('click',()=>{drum.selected=i;renderHitShaper();});row.append(name);
  const wave=document.createElement('select');wave.setAttribute('aria-label',`${track.name} waveform`);fillWaveSelect(wave,track.waveId);wave.addEventListener('change',()=>{track.waveId=wave.value;drum.selected=i;renderHitShaper();});row.append(wave);
  const mute=document.createElement('button');mute.className='track-mute';mute.addEventListener('click',()=>{track.mute=!track.mute;renderDrumRows();});row.append(mute);
  const steps=[];for(let step=0;step<count;step++){const button=document.createElement('button');button.className=`step-button${step%(drum.meter.denominator===8?2:4)===0?' group-start':''}`;button.title='Click: off → hit → accent';button.addEventListener('click',event=>{const at=drum.editBar*count+step;if(window.paintBeatModifier?.(track,at)){renderDrumRows();return;}track.steps[at]=event.shiftKey?1:track.steps[at]===0?.5:track.steps[at]===.5?1:0;renderDrumRows();});row.append(button);steps.push(button);}
  grid.append(row);drumRows.push({container:row,name,wave,mute,steps});
 });renderHitShaper();
}
function applyPattern(style,randomize=false){
 const count=drumStepCount(),offset=drum.editBar*count,rows=drum.tracks.map(()=>Array(count).fill(0)),position=value=>Math.min(count-1,Math.floor(value*count/16));
 if(style!=='blank'){
  (style==='four'?Array.from({length:Math.ceil(count/4)},(_,i)=>i*4):(style==='half'?[0,7,10]:[0,3,8,11]).map(position)).forEach(i=>rows[0][i]=1);
  (style==='half'?[8]:[4,12]).map(position).forEach(i=>rows[1][i]=1);
  for(let i=0;i<count;i+=2)rows[2][i]=i%4===0?1:.5;
  (style==='four'?[6,14]:[2,10,15]).map(position).forEach(i=>rows[3][i]=.5);
 }
 if(randomize){for(let i=0;i<count;i++){if(i%4!==0&&Math.random()<.18)rows[0][i]=.5;if(i%2===1&&Math.random()<.45)rows[2][i]=.5;if(Math.random()<.22)rows[3][i]=Math.random()<.2?1:.5;}rows[0][0]=1;rows[1][position(style==='half'?8:4)]=1;}
 drum.tracks.forEach((track,i)=>rows[i].forEach((value,step)=>track.steps[offset+step]=value));renderDrumRows();$('beat-status').textContent=randomize?`Generated a variation in measure ${drum.editBar+1}.`:`Pattern loaded into measure ${drum.editBar+1}. Other measures and hit shapes were kept.`;
}
function signalsForTracks(){return Object.fromEntries(waveBank.waves.map(w=>[w.id,waveSignal(w.id)]));}
function drumPattern(){return {bpm:drum.bpm,swing:drum.swing,bars:drum.bars,meter:{...drum.meter},tracks:drum.tracks,pads:drum.pads};}
$('bank-select').addEventListener('change',e=>{waveBank.selected=e.target.value;renderBank();});
$('bank-to-drum').addEventListener('click',()=>{drum.tracks[drum.selected].waveId=selectedWave().id;renderHitShaper();notice(`${selectedWave().name} loaded into ${drum.tracks[drum.selected].name}.`);});
$('bank-remove').addEventListener('click',()=>{const wave=selectedWave();if(wave.id.startsWith('stock-'))return;waveBank.removed={wave,index:waveBank.waves.findIndex(w=>w.id===wave.id),tracks:drum.tracks.map(t=>t.waveId),pads:drum.pads.map(p=>p.waveId)};waveBank.waves=waveBank.waves.filter(w=>w.id!==wave.id);drum.tracks.forEach(t=>{if(t.waveId===wave.id)t.waveId='stock-sine';});waveBank.cache.delete(wave.id);drum.cache.clear();saveBankStorage();renderBank();renderHitShaper();notice('Wave removed. Undo remove is available.');});
$('bank-undo').addEventListener('click',()=>{const removed=waveBank.removed;if(!removed)return;try{waveBank.waves=WaveLibrary.merge(waveBank.waves,[removed.wave]);waveBank.selected=removed.wave.id;drum.tracks.forEach((t,i)=>{if(removed.tracks[i]===removed.wave.id&&t.waveId==='stock-sine')t.waveId=removed.wave.id;});drum.pads.forEach((p,i)=>{if(removed.pads?.[i]===removed.wave.id&&!p.waveId)p.waveId=removed.wave.id;});waveBank.removed=null;saveBankStorage();renderBank();renderHitShaper();}catch(e){notice(e.message);}});
$('bank-export').addEventListener('click',()=>downloadStudio(JSON.stringify({kind:'dot-wave-library',version:1,waves:waveBank.waves},null,2),'application/json','dot-wave-library.json'));
$('bank-import').addEventListener('click',()=>$('bank-file').click());
$('bank-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>1500000)throw new Error('Library file is too large.');const incoming=WaveLibrary.validateBundle(JSON.parse(await file.text()));waveBank.waves=WaveLibrary.prepareImport(waveBank.waves,incoming,bankId).waves;saveBankStorage();renderBank();notice('Library imported. Existing waves were kept.');}catch(e){notice(e instanceof SyntaxError?'That file is not valid library JSON.':e.message);}});
$('beat-play').addEventListener('click',toggleDrums);$('beat-stop').addEventListener('click',stopDrumMachine);$('hit-preview').addEventListener('click',previewDrumHit);
$('beat-bpm').addEventListener('change',e=>{const value=Number(e.target.value);if(window.setStudioTempo)return window.setStudioTempo(value);if(Number.isFinite(value)&&value>=40&&value<=240)drum.bpm=Math.round(value);renderDrumTransport();});
$('beat-swing').addEventListener('input',e=>{drum.swing=+e.target.value/100;renderDrumTransport();});
$('beat-volume').addEventListener('input',e=>{drum.volume=+e.target.value/100;if(drum.bus&&engine)smooth(drum.bus.gain,drum.volume);renderDrumTransport();});
$('beat-measures').addEventListener('change',event=>{try{resizeDrumMeasures(+event.target.value,drum.meter);}catch(error){renderMeasureControls();notice(error.message);}});
$('beat-meter').addEventListener('change',event=>{try{const [numerator,denominator]=event.target.value.split('/').map(Number);resizeDrumMeasures(drum.bars,{numerator,denominator});}catch(error){renderMeasureControls();notice(error.message);}});
$('beat-measure-prev').addEventListener('click',()=>selectDrumMeasure(drum.editBar-1));$('beat-measure-next').addEventListener('click',()=>selectDrumMeasure(drum.editBar+1));
$('beat-add-measure').addEventListener('click',addDrumMeasure);
$('beat-follow').addEventListener('change',event=>{drum.follow=event.target.checked;renderMeasureControls();});
$('beat-copy-next').addEventListener('click',()=>duplicateDrumMeasure());
$('beat-preset').addEventListener('click',()=>applyPattern($('beat-style').value));$('beat-generate').addEventListener('click',()=>applyPattern($('beat-style').value==='blank'?'broken':$('beat-style').value,true));
for(const [key,config]of Object.entries(hitFields))$(`hit-${key}`).addEventListener('input',e=>{if(key==='pitch'&&window.setDrumPitchFromInput){window.setDrumPitchFromInput(+e.target.value);return;}drum.tracks[drum.selected][key]=+e.target.value/config.scale;renderHitShaper();});
function beatMapProject(){return {kind:'dot-drum-machine',version:3,name:$('beat-name').value.trim().slice(0,48)||'My beatMAP',library:waveBank.waves,pattern:DrumDSP.validatePattern(drumPattern()),drumVolume:drum.volume,program:window.drumProgramDraft?.(),editor:{measure:drum.editBar,voice:drum.selected,pad:+$('pad-edit-number').value,follow:drum.follow,chip:$('program-chip').checked}};}
$('kit-save').addEventListener('click',async()=>{try{const project=beatMapProject(),name=project.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'my-map';await downloadStudio(JSON.stringify(project,null,2),'application/json',name+'.beatmap.json');$('beatmap-status').textContent='Saved “'+project.name+'” as an editable beatMAP. Load this file later to continue; saving again makes a new version.';}catch(e){$('beatmap-status').textContent=e.message;notice(e.message);}});
$('kit-load').addEventListener('click',()=>$('kit-file').click());
$('kit-file').addEventListener('change',async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{
  if(file.size>1800000)throw new Error('beatMAP file is too large.');
  restoreBeatmap(JSON.parse(await file.text()));
  saveBeatmapDraft();
 }
 catch(e){const message=e instanceof SyntaxError?'That file is not valid beatMAP JSON.':e.message;$('beatmap-status').textContent=message;notice(message);}
});
function restoreBeatmap(data) {
 if(!data || data.kind!=='dot-drum-machine'||![1,2,3].includes(data.version))throw new Error('Choose an editable beatMAP or an older Dot Drum Machine kit file.');
  const program=DrumProgram.draft(data.program);
  const waves=WaveLibrary.validateBundle({kind:'dot-wave-library',version:1,waves:data.library}),pattern=DrumDSP.validatePattern(data.pattern);
  const name=data.name===undefined?'Imported beatMAP':data.name;
  if(typeof name!=='string'||!name.trim()||name.length>48)throw new Error('Invalid beatMAP name.');
  const editor=(data.version>=3?data.editor:undefined)??{measure:0,voice:0,pad:1,follow:true,chip:true};
  if(!editor||!Number.isInteger(editor.measure)||editor.measure<0||editor.measure>=pattern.bars||!Number.isInteger(editor.voice)||editor.voice<0||editor.voice>3||!Number.isInteger(editor.pad)||editor.pad<1||editor.pad>9||typeof editor.follow!=='boolean'||typeof editor.chip!=='boolean')throw new Error('Invalid beatMAP editing position.');
  if(typeof data.drumVolume!=='number'||!Number.isFinite(data.drumVolume)||data.drumVolume<0||data.drumVolume>1)throw new Error('Invalid drum volume.');
  if(DrumDSP.allTracks(pattern).some(track=>!waves.some(w=>w.id===track.waveId)))throw new Error('This kit is missing a waveform.');
  const incoming=WaveLibrary.prepareImport(waveBank.waves,waves,bankId);
  for(const track of pattern.tracks)track.waveId=incoming.remap.get(track.waveId)||track.waveId;for(const pad of pattern.pads||[])if(pad.waveId)pad.waveId=incoming.remap.get(pad.waveId)||pad.waveId;
  stopAll();waveBank.waves=incoming.waves;waveBank.cache.clear();drum.cache.clear();drum.tracks=pattern.tracks;drum.pads=pattern.pads||DrumDSP.defaultPads(pattern.bars*DrumDSP.stepsPerBar(pattern.meter));drum.bpm=pattern.bpm;drum.swing=pattern.swing;drum.bars=pattern.bars;drum.meter=pattern.meter;drum.editBar=editor.measure;drum.follow=editor.follow;drum.measureStash.clear();drum.padStash.clear();window.clearBeatModifierStash?.();window.resetPadHistory?.();drum.volume=data.drumVolume;drum.selected=editor.voice;
  if(drum.bus&&engine)smooth(drum.bus.gain,drum.volume);
  window.loadDrumProgram?.(program);$('beat-name').value=name.trim();$('pad-edit-number').value=String(editor.pad);$('program-chip').checked=editor.chip;$('beat-modifier').value='edit';window.showModifier?.();
  if(drum.bars>1)$('beat-bars').value='0';saveBankStorage();buildDrumRows();renderBank();renderDrumTransport();clearDrumCursor();$('beat-status').textContent='beatMAP loaded. Edit any measure, pad, sound, or program; playback stays stopped.';$('beatmap-status').textContent='Opened “'+name.trim()+'”. Edit, then Save beatMAP to keep a new version.';
}
$('beat-export').addEventListener('click',async()=>{try{const loop=$('beat-loop-export').checked,rendered=DrumDSP.renderPattern(signalsForTracks(),drum.tracks,{bpm:drum.bpm,swing:drum.swing,meter:drum.meter,bars:+$('beat-bars').value||drum.bars,rate:48000,gain:drum.volume,loop,pads:drum.pads});await downloadStudio(DrumDSP.encodeWav(rendered.samples,rendered.rate),'audio/wav',`dot-beat-${drum.bpm}bpm.wav`);$('beat-status').textContent=loop?'Exact-length loop exported with tails wrapped to the start, before EQ.':'Beat exported with hit tails, at drum level, before EQ and Master.';}catch(e){notice(e.message);}});
buildDrumRows();renderBank();renderDrumTransport();
