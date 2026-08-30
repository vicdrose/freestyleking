/**
 * Audio engine — reproduces the Tone.js setup from page-main5.php.
 *
 * - player: Tone.Player for beats/breaks/fkbeats/custom URLs
 * - sampler: Tone.Sampler for pads/bass/SFX/fills (single C4 sample)
 * - mic: Tone.UserMedia microphone
 * - recorder: MediaRecorder combining player + mic + sampler
 */
import * as Tone from 'tone';

export function initAudio() {
  const chunks = [];
  const audio = document.querySelector('#recAudio');

  const actx = Tone.context;
  const dest = actx.createMediaStreamDestination();
  const recorder = new MediaRecorder(dest.stream);

  const mic = new Tone.UserMedia();
  const micFFT = new Tone.FFT();
  mic.connect(micFFT);

  const player = new Tone.Player({
    loop: true,
    loopStart: 0,
    loopEnd: 230
  }).toDestination();

  const sampler = new Tone.Sampler({
    release: 1
  });
  const samplerGain = new Tone.Gain(1);
  sampler.connect(samplerGain);
  samplerGain.toDestination();
  samplerGain.connect(dest);

  const beatPlayer = new Tone.Player({});
  const beatGain = new Tone.Gain(1);
  beatPlayer.connect(beatGain);
  beatGain.toDestination();
  beatGain.connect(dest);

  const beatEl = document.querySelector('#autoBeatAudio');

  player.connect(dest);
  mic.connect(dest);

  recorder.ondataavailable = (evt) => chunks.push(evt.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/wav; codecs=opus' });
    audio.src = URL.createObjectURL(blob);
  };

  return { player, sampler, mic, micFFT, recorder, dest, actx, chunks, audio, beatEl, beatGain, beatPlayer, samplerGain };
}
