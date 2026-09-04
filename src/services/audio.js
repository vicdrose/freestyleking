/**
 * Audio engine — reproduces the Tone.js setup from page-main5.php.
 *
 * - player: Tone.Player for beats/breaks/fkbeats/custom URLs
 * - sampler: Tone.Sampler for pads/bass/SFX/fills (single C4 sample)
 * - mic: Tone.UserMedia microphone
 * - recorder: two MediaRecorders (beat-only bus + vox-only bus) so a take can
 *   be surgically re-aligned after recording before being combined into one
 *   final file. The monitor bus (dest -> speakers) is unchanged.
 */
import * as Tone from 'tone';

export function initAudio() {
  const chunks = [];
  const audio = document.querySelector('#recAudio');

  const actx = Tone.context;
  const dest = actx.createMediaStreamDestination();

  const mic = new Tone.UserMedia();
  const micFFT = new Tone.FFT();
  mic.connect(micFFT);

  const player = new Tone.Player({
    loop: true,
    loopStart: 0,
    loopEnd: 230
  });
  // Dedicated gain for the beat player so the volume slider has a real,
  // audible path (Tone.Player.volume is read-only in Tone 14).
  const playerGain = new Tone.Gain(1);
  player.connect(playerGain);
  playerGain.toDestination();

  const sampler = new Tone.Sampler({
    release: 1
  });
  const samplerGain = new Tone.Gain(1);
  sampler.connect(samplerGain);
  samplerGain.toDestination();

  const beatPlayer = new Tone.Player({});
  const beatGain = new Tone.Gain(1);
  beatPlayer.connect(beatGain);
  beatGain.toDestination();

  // Drummer+ sequencer bus — carries all Drummer+ rows to speakers + recording.
  const drummerGain = new Tone.Gain(1);
  drummerGain.toDestination();

  const beatEl = document.querySelector('#autoBeatAudio');

  // Monitor bus — everything the performer hears while recording, unchanged.
  playerGain.connect(dest);
  samplerGain.connect(dest);
  beatGain.connect(dest);
  drummerGain.connect(dest);
  mic.connect(dest);

  // Separate silent taps for the two-track take. The beat bus carries the
  // loaded beat + pads + auto-beats; the vox bus carries only the mic. These
  // tap nodes never reach speakers (no feedback).
  const beatDest = actx.createMediaStreamDestination();
  const micDest = actx.createMediaStreamDestination();
  playerGain.connect(beatDest);
  samplerGain.connect(beatDest);
  beatGain.connect(beatDest);
  drummerGain.connect(beatDest);
  mic.connect(micDest);

  const take = { beat: null, mic: null, pending: 0, onready: null };

  const makeRecorder = (stream, slot) => {
    const rec = new MediaRecorder(stream);
    const arr = [];
    rec.ondataavailable = (evt) => {
      if (evt.data && evt.data.size) arr.push(evt.data);
    };
    rec.onstop = () => {
      take[slot] = new Blob(arr, { type: rec.mimeType || 'audio/webm' });
      take.pending = Math.max(0, take.pending - 1);
      if (take.pending === 0) {
        const cb = take.onready;
        take.onready = null;
        if (cb) cb(take.beat, take.mic);
      }
    };
    return rec;
  };

  const beatRec = makeRecorder(beatDest.stream, 'beat');
  const micRec = makeRecorder(micDest.stream, 'mic');

  // Wrapper kept under the old name so app.js wiring keeps working.
  const recorder = {
    state: 'inactive',
    onstop: null,
    start() {
      take.pending = 2;
      take.onready = recorder.onstop;
      recorder.state = 'recording';
      beatRec.start();
      micRec.start();
    },
    stop() {
      if (recorder.state !== 'recording') return;
      recorder.state = 'inactive';
      beatRec.stop();
      micRec.stop();
    }
  };

  return { player, playerGain, sampler, mic, micFFT, recorder, dest, actx, chunks, audio, beatEl, beatGain, beatPlayer, samplerGain, drummerGain };
}