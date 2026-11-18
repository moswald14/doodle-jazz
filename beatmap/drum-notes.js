(function(root){
 'use strict';
 const MIN_HZ=30,MAX_HZ=2000,MIN_MIDI=23,MAX_MIDI=95,names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],flats={1:'D♭',3:'E♭',6:'G♭',8:'A♭',10:'B♭'};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function pitch(value){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw Error('Choose a valid drum pitch.');return clamp(value,MIN_HZ,MAX_HZ);}
 function hz(midi){if(!Number.isInteger(midi)||midi<MIN_MIDI||midi>MAX_MIDI)throw Error('Choose a drum note from B0 to B6.');return 440*2**((midi-69)/12);}
 function nearestMidi(value){return clamp(Math.round(69+12*Math.log2(pitch(value)/440)),MIN_MIDI,MAX_MIDI);}
 function name(midi){hz(midi);return names[midi%12]+(Math.floor(midi/12)-1);}
 function label(midi){const sharp=name(midi),flat=flats[midi%12];return flat?sharp+' / '+flat+(Math.floor(midi/12)-1):sharp;}
 function describe(value){const frequency=pitch(value),midi=nearestMidi(frequency),cents=1200*Math.log2(frequency/hz(midi));return {frequency,midi,note:name(midi),cents,exact:Math.abs(cents)<.001};}
 function snap(value){return hz(nearestMidi(value));}
 function nudge(value,amount,snapped=true){if(!Number.isFinite(amount))throw Error('Choose a valid pitch step.');return snapped?hz(clamp(nearestMidi(value)+Math.round(amount),MIN_MIDI,MAX_MIDI)):pitch(pitch(value)+amount);}
 const api={MIN_HZ,MAX_HZ,MIN_MIDI,MAX_MIDI,hz,nearestMidi,name,label,describe,snap,nudge};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DrumNotes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
