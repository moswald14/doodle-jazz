'use strict';
const BANK_KEY='doodle-jazz-beatmap-waves-v1';
const waveBank={waves:WaveLibrary.stockWaves(),selected:'stock-sine',cache:new Map(),removed:null,storageOK:true};
try{const saved=localStorage.getItem(BANK_KEY);if(saved)waveBank.waves=WaveLibrary.merge(waveBank.waves,WaveLibrary.validateBundle(JSON.parse(saved)));}catch(error){waveBank.storageOK=false;}
const defaultDrumKit=DrumDSP.defaultKit();
const drum={...defaultDrumKit.pattern,padStash:new Map(),editBar:0,follow:true,measureStash:new Map(),volume:defaultDrumKit.drumVolume,selected:0,playing:false,pending:false,token:0,auditionToken:0,timer:null,nextTime:0,step:0,queue:[],current:-1,bus:null,context:null,cache:new Map(),voices:new Set()};
window.dotDrum=drum;window.dotWaveBank=waveBank;
const drumRows = [], stepNumbers = [];
let jazzCursor = null;
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
 $('beat-play').textContent=drum.playing?'Stop preview':drum.pending?'Cancel preview':'Solo preview';$('beat-play').setAttribute('aria-pressed',String(drum.playing));
 $('beat-bpm').value=drum.bpm;$('beat-swing').value=Math.round(drum.swing*100);$('beat-swing-value').textContent=`${Math.round(drum.swing*100)}%`;$('beat-volume').value=Math.round(drum.volume*100);$('beat-volume-value').textContent=`${Math.round(drum.volume*100)}%`;
 renderMeasureControls();
}
function drumStepCount(){return DrumDSP.stepsPerBar(drum.meter);}
function programIsPlaying() {
  return $('program-play').getAttribute('aria-pressed') === 'true';
}
function paintDrumCursor() {
  const count = drumStepCount();
  const program = programIsPlaying();
  let cursor = program ? null : jazzCursor;
  if (drum.playing) {
    cursor = drum.current < 0 ? null : { measure: Math.floor(drum.current / count) + 1, step: drum.current % count + 1, steps: count };
  }
  const position = $('beat-position');
  position.classList.toggle('is-live', Boolean(cursor && !drum.playing));
  if (!program) {
    position.textContent = cursor
      ? `${drum.playing ? 'Preview' : 'Jazz'} · Measure ${cursor.measure} · Step ${cursor.step}/${cursor.steps}`
      : 'Ready';
  }
  Array.from($('beat-measure-pages').children).forEach((button, index) => {
    if (cursor?.measure === index + 1) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  for (const cell of $('drum-sequencer').querySelectorAll('.is-current')) cell.classList.remove('is-current');
  if (cursor?.measure !== drum.editBar + 1 || cursor.steps !== count) return;
  const step = cursor.step - 1;
  stepNumbers[step]?.classList.add('is-current');
  for (const row of drumRows) row.steps[step]?.classList.add('is-current');
}
function followJazzCursor() {
  if (drum.playing || programIsPlaying()) return;
  const measure = jazzCursor?.measure;
  if (drum.follow && measure && measure <= drum.bars && measure !== drum.editBar + 1) selectDrumMeasure(measure - 1, true);
  else paintDrumCursor();
}
window.setJazzPlayhead = position => { jazzCursor = position; followJazzCursor(); };
function clearDrumCursor() {
  drum.current = -1;
  paintDrumCursor();
}
function renderMeasureControls(){
 $('beat-measures').value=drum.bars;$('beat-meter').value=`${drum.meter.numerator}/${drum.meter.denominator}`;$('beat-follow').checked=drum.follow;
 $('beat-copy-next').disabled=drum.bars>=8;
 $('beat-add-measure').disabled=drum.bars>=8;$('beat-add-measure').title=drum.bars>=8?'Eight measures maximum per beatMAP':'Append a blank measure and edit it';
 window.renderMeasureEditing?.();
 const pager = $('beat-measure-pages');
 if (pager.children.length !== drum.bars) {
   pager.replaceChildren(...Array.from({ length: drum.bars }, (_, index) => {
     const button = document.createElement('button');
     button.textContent = String(index + 1);
     button.setAttribute('aria-label', `Edit measure ${index + 1}`);
     button.addEventListener('click', () => selectDrumMeasure(index));
     return button;
   }));
 }
 Array.from(pager.children).forEach((button, index) => button.setAttribute('aria-pressed', String(index === drum.editBar)));
 paintDrumCursor();
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
 if (current === null || current === drum.current) return;
 drum.current = current;
 const bar = Math.floor(current / drumStepCount());
 if (drum.follow && bar !== drum.editBar) selectDrumMeasure(bar, true);
 else paintDrumCursor();
};
async function previewDrumHit(){
 const token=++drum.auditionToken;
 try{const e=await ensureAudio();if(token!==drum.auditionToken)return;triggerDrumHit(e,{...drum.tracks[drum.selected],mute:false},e.context.currentTime+.01,1);}
 catch(error){notice(error.message);}
}
function renderDrumRows() {
  const offset = drum.editBar * drumStepCount();
  drumRows.forEach((row, index) => {
    const track = drum.tracks[index];
    row.container.classList.toggle('selected', index === drum.selected);
    row.name.setAttribute('aria-pressed', String(index === drum.selected));
    row.mute.setAttribute('aria-pressed', String(track.mute));
    row.mute.textContent = track.mute ? 'Off' : 'On';
    row.mute.setAttribute('aria-label', `${track.mute ? 'Unmute' : 'Mute'} ${track.name}`);
    row.wave.value = track.waveId;
    row.steps.forEach((button, step) => {
      const velocity = track.steps[offset + step];
      button.dataset.velocity = String(velocity);
      button.setAttribute('aria-pressed', String(velocity > 0));
      button.setAttribute('aria-label', `${track.name}, measure ${drum.editBar + 1}, step ${step + 1}, ${velocity === 0 ? 'off' : velocity === 1 ? 'accent' : 'hit'}`);
      button.textContent = window.beatModifierLabel?.(track, offset + step) || (velocity === 1 ? '•' : '');
      button.title = track.modifiers?.[offset + step] ? 'Modifier: ' + track.modifiers[offset + step] : 'Click: off → hit → accent';
    });
  });
  paintDrumCursor();
}
const hitFields={pitch:{scale:1,format:v=>`${v} Hz`},decay:{scale:1000,format:v=>`${Math.round(v*1000)} ms`},sweep:{scale:1,format:v=>`${v} st`},noise:{scale:100,format:v=>`${Math.round(v*100)}%`},tone:{scale:1,format:v=>`${v} Hz`},level:{scale:100,format:v=>`${Math.round(v*100)}%`}};
function renderHitShaper(){const track=drum.tracks[drum.selected];$('shaper-name').textContent=`${track.name} · ${waveBank.waves.find(w=>w.id===track.waveId)?.name||'Wave'}`;for(const [key,config]of Object.entries(hitFields)){$(`hit-${key}`).value=key==='pitch'?track[key]:Math.round(track[key]*config.scale);$(`hit-${key}-value`).textContent=config.format(track[key]);}window.renderDrumNotes?.();renderDrumRows();}
function buildDrumRows(){
 const grid = $('drum-sequencer'), count = drumStepCount();
 grid.replaceChildren();
 grid.style.setProperty('--steps', count);
 drumRows.length = 0;
 stepNumbers.length = 0;
 const heading = document.createElement('div'), caption = document.createElement('span'), numbers = document.createElement('div');
 heading.className = 'step-heading';
 caption.textContent = 'Drum / sound';
 numbers.className = 'step-grid';
 for (let step = 0; step < count; step++) {
   const label = document.createElement('span');
   label.textContent = String(step + 1);
   stepNumbers.push(label);
   numbers.append(label);
 }
 heading.append(caption, numbers);
 grid.append(heading);
 drum.tracks.forEach((track,i)=>{
  const row = document.createElement('div'), controls = document.createElement('div'), cells = document.createElement('div');
  row.className = 'drum-row';
  controls.className = 'drum-row-controls';
  cells.className = 'step-grid';
  const name=document.createElement('button');name.className='drum-name';name.textContent=track.name;name.setAttribute('aria-label',`Shape ${track.name}`);name.addEventListener('click',()=>{drum.selected=i;renderHitShaper();});
  const wave=document.createElement('select');wave.setAttribute('aria-label',`${track.name} waveform`);fillWaveSelect(wave,track.waveId);wave.addEventListener('change',()=>{track.waveId=wave.value;drum.selected=i;renderHitShaper();});
  const mute=document.createElement('button');mute.className='track-mute';mute.addEventListener('click',()=>{track.mute=!track.mute;renderDrumRows();});
  const steps = Array.from({ length: count }, (_, step) => {
    const button = document.createElement('button');
    button.className = 'step-button';
    button.classList.toggle('group-start', step % (drum.meter.denominator === 8 ? 2 : 4) === 0);
    button.dataset.step = step + 1;
    button.addEventListener('click', event => {
      const at = drum.editBar * count + step;
      if (!window.paintBeatModifier?.(track, at)) {
        const velocity = track.steps[at];
        track.steps[at] = event.shiftKey ? 1 : velocity === 0 ? 0.5 : velocity === 0.5 ? 1 : 0;
      }
      renderDrumRows();
    });
    return button;
  });
  controls.append(name, wave, mute);
  cells.append(...steps);
  row.append(controls, cells);
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
$('beat-play').addEventListener('click',toggleDrums);$('hit-preview').addEventListener('click',previewDrumHit);
$('beat-bpm').addEventListener('change',e=>{const value=Number(e.target.value);if(window.setStudioTempo)return window.setStudioTempo(value);if(Number.isFinite(value)&&value>=40&&value<=240)drum.bpm=Math.round(value);renderDrumTransport();});
$('beat-swing').addEventListener('input',e=>{drum.swing=+e.target.value/100;renderDrumTransport();});
$('beat-volume').addEventListener('input',e=>{drum.volume=+e.target.value/100;if(drum.bus&&engine)smooth(drum.bus.gain,drum.volume);renderDrumTransport();});
$('beat-measures').addEventListener('change',event=>{try{resizeDrumMeasures(+event.target.value,drum.meter);}catch(error){renderMeasureControls();notice(error.message);}});
$('beat-meter').addEventListener('change',event=>{try{const [numerator,denominator]=event.target.value.split('/').map(Number);resizeDrumMeasures(drum.bars,{numerator,denominator});}catch(error){renderMeasureControls();notice(error.message);}});
$('beat-add-measure').addEventListener('click',addDrumMeasure);
$('beat-follow').addEventListener('change',event=>{drum.follow=event.target.checked;followJazzCursor();});
$('beat-copy-next').addEventListener('click',()=>duplicateDrumMeasure());
$('beat-preset').addEventListener('click',()=>applyPattern($('beat-style').value));$('beat-generate').addEventListener('click',()=>applyPattern($('beat-style').value==='blank'?'broken':$('beat-style').value,true));
for(const [key,config]of Object.entries(hitFields))$(`hit-${key}`).addEventListener('input',e=>{if(key==='pitch'&&window.setDrumPitchFromInput){window.setDrumPitchFromInput(+e.target.value);return;}drum.tracks[drum.selected][key]=+e.target.value/config.scale;renderHitShaper();});
function beatMapProject(){return {kind:'dot-drum-machine',version:3,name:$('beat-name').value.trim().slice(0,48)||defaultDrumKit.name,library:waveBank.waves,pattern:DrumDSP.validatePattern(drumPattern()),drumVolume:drum.volume,program:window.drumProgramDraft?.(),editor:{measure:drum.editBar,voice:drum.selected,pad:+$('pad-edit-number').value,follow:drum.follow,chip:$('program-chip').checked,jazzProgram:$('program-live').checked}};}
$('kit-save').addEventListener('click',async()=>{try{const project=beatMapProject(),name=project.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'my-map';await downloadStudio(JSON.stringify(project,null,2),'application/json',name+'.beatmap.json');$('beatmap-status').textContent='Saved “'+project.name+'” as an editable beatMAP. Load this file later to continue; saving again makes a new version.';}catch(e){$('beatmap-status').textContent=e.message;notice(e.message);}});
$('kit-load').addEventListener('click',()=>$('kit-file').click());
$('kit-file').addEventListener('change',async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{
  if(file.size>1800000)throw new Error('beatMAP file is too large.');
  restoreBeatmap(JSON.parse(await file.text()));
  saveBeatmapDraft();
  window.queueBeatmapEdit?.();
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
  window.loadDrumProgram?.(program);$('beat-name').value=name.trim();$('pad-edit-number').value=String(editor.pad);$('program-chip').checked=editor.chip;$('program-live').checked=editor.jazzProgram===true;$('beat-modifier').value='edit';window.showModifier?.();
  if(drum.bars>1)$('beat-bars').value='0';saveBankStorage();buildDrumRows();renderBank();renderDrumTransport();clearDrumCursor();$('beat-status').textContent='beatMAP loaded.';$('beatmap-status').textContent='Opened “'+name.trim()+'”. Edit, then Save beatMAP to keep a new version.';
}
$('beat-export').addEventListener('click',async()=>{try{const loop=$('beat-loop-export').checked,rendered=DrumDSP.renderPattern(signalsForTracks(),drum.tracks,{bpm:drum.bpm,swing:drum.swing,meter:drum.meter,bars:+$('beat-bars').value||drum.bars,rate:48000,gain:drum.volume,loop,pads:drum.pads});await downloadStudio(DrumDSP.encodeWav(rendered.samples,rendered.rate),'audio/wav',`dot-beat-${drum.bpm}bpm.wav`);$('beat-status').textContent=loop?'Exact-length loop exported with tails wrapped to the start, before EQ.':'Beat exported with hit tails, at drum level, before EQ and Master.';}catch(e){notice(e.message);}});
buildDrumRows();renderBank();renderDrumTransport();
