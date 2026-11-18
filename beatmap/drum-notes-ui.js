'use strict';
const drumHzText=value=>Number(value).toFixed(2).replace(/\.00$/,'')+' Hz';
function renderDrumNotes(){const track=drum.tracks[drum.selected],note=DrumNotes.describe(track.pitch),snap=$('hit-note-snap').checked;
 $('hit-note-custom').textContent='Custom · '+drumHzText(track.pitch);$('hit-note-custom').disabled=note.exact;$('hit-note').value=note.exact?String(note.midi):'custom';
 $('hit-note-info').textContent=note.exact?note.note+' · '+drumHzText(track.pitch)+' · A4 = 440 Hz':'Nearest: '+note.note+' · '+(note.cents>=0?'+':'')+note.cents.toFixed(1)+' cents. Snap current tunes this hit.';
 $('hit-pitch').step='any';$('hit-pitch').setAttribute('aria-valuetext',drumHzText(track.pitch)+', '+(note.exact?note.note:'near '+note.note));
 for(const [id,direction]of [['less',-1],['more',1]]){const button=$('hit-pitch-'+id);if(!button)continue;button.setAttribute('aria-label',(direction<0?'Lower':'Raise')+' drum pitch by '+(snap?'one semitone':'1 Hz'));button.title=snap?'One musical note':'Fine tune by 1 Hz';button.disabled=snap?(direction<0?note.midi<=DrumNotes.MIN_MIDI:note.midi>=DrumNotes.MAX_MIDI):(direction<0?track.pitch<=30:track.pitch>=2000);}
}
function setDrumPitch(value,snap=$('hit-note-snap').checked){if(!Number.isFinite(value)){renderHitShaper();return false;}drum.tracks[drum.selected].pitch=snap?DrumNotes.snap(value):clamp(value,30,2000);renderHitShaper();return true;}
window.renderDrumNotes=renderDrumNotes;
window.setDrumPitchFromInput=value=>setDrumPitch(value);
window.nudgeDrumPitch=direction=>setDrumPitch(DrumNotes.nudge(drum.tracks[drum.selected].pitch,direction,$('hit-note-snap').checked),false);
const customNote=document.createElement('option');customNote.setAttribute('id','hit-note-custom');customNote.value='custom';customNote.textContent='Custom pitch';$('hit-note').append(customNote);
for(let midi=DrumNotes.MIN_MIDI;midi<=DrumNotes.MAX_MIDI;midi++)mixOption($('hit-note'),String(midi),DrumNotes.label(midi)+' · '+drumHzText(DrumNotes.hz(midi)));
$('hit-note').addEventListener('change',()=>{const value=$('hit-note').value;if(value==='custom')return;const midi=Number(value);if(!Number.isInteger(midi)||midi<DrumNotes.MIN_MIDI||midi>DrumNotes.MAX_MIDI){renderHitShaper();return;}setDrumPitch(DrumNotes.hz(midi),false);});
$('hit-note-snap').addEventListener('change',()=>{if($('hit-note-snap').checked)setDrumPitch(drum.tracks[drum.selected].pitch,true);else renderHitShaper();});
$('hit-snap-now').addEventListener('click',()=>setDrumPitch(drum.tracks[drum.selected].pitch,true));
$('hit-pitch').addEventListener('keydown',event=>{const key=event.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(key))return;event.preventDefault();const snapped=$('hit-note-snap').checked;if(key==='Home'||key==='End'){setDrumPitch(snapped?DrumNotes.hz(key==='Home'?DrumNotes.MIN_MIDI:DrumNotes.MAX_MIDI):(key==='Home'?30:2000),false);return;}const direction=['ArrowLeft','ArrowDown','PageDown'].includes(key)?-1:1,large=event.shiftKey||key==='PageUp'||key==='PageDown',amount=direction*(large?(snapped?12:10):1);setDrumPitch(DrumNotes.nudge(drum.tracks[drum.selected].pitch,amount,snapped),false);});
hitFields.pitch.format=drumHzText;renderHitShaper();
