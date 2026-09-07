// Freestyle King — YouTube beat converter (self-hosted, Render-friendly).
//
// Endpoints:
//   GET /health            -> { ok: true }
//   GET /convert?url=<yt>&name=<label>&token=<t>
//       Downloads the best audio stream of a YouTube video with yt-dlp,
//       transcodes it to 16-bit 44.1kHz stereo WAV with ffmpeg, and streams
//       it back with CORS headers so the static PWA can fetch it to a blob.
//
// Env vars:
//   YT_CONVERT_TOKEN  optional shared secret; when set, /convert demands &token=
//   MAX_SECONDS       optional max video length in seconds (default 600)
//   PORT              Render sets this (default 3000)
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import youtubedl from 'yt-dlp-exec';
import ffmpegPath from 'ffmpeg-static';

// yt-dlp needs a JS runtime (deno) to extract YouTube format data (the modern
// player returns a JS challenge). deno-bin ships a static deno binary; pass its
// absolute path straight into --js-runtimes so no PATH guessing is involved.
const require = createRequire(import.meta.url);
const denoBin = require.resolve('deno-bin/bin/deno');
const YTDL_OPTS = { jsRuntimes: 'deno:' + denoBin };

const execFileP = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.YT_CONVERT_TOKEN || null;
const MAX_SECONDS = Number(process.env.MAX_SECONDS || 600);

app.use(cors());
app.use(express.json());

const isYtUrl = (u) =>
  /(^|[/.])youtube\.com\/(watch\?(?:[^#]*[?&])?v=|shorts\/|embed\/|live\/)/.test(u) ||
  /(^|[/.])youtu\.be\//.test(u);

// YouTube player clients. Default (visionos/web) now demands a JS runtime and
// often 403s from datacenter IPs; android/tv/ios usually bypass both.
const CLIENT_ARGS = {
  'web': 'youtube:player_client=web',
  'android': 'youtube:player_client=android',
  'ios': 'youtube:player_client=ios',
  'tv': 'youtube:player_client=tv',
  'mweb': 'youtube:player_client=mweb',
  'web_safari': 'youtube:player_client=web_safari',
  'web_embedded': 'youtube:player_client=web_embedded',
  'tv_embedded': 'youtube:player_client=tv_embedded'
};

const videoId = (u) => {
  const m = String(u).match(/(?:v=|shorts\/|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})(?:[?&#/]|$)/);
  return m ? m[1] : null;
};

app.get('/health', (_req, res) => res.json({ ok: true, deno: DENO_STATUS }));

app.get('/convert', async (req, res) => {
  const url = String(req.query.url || '').trim();
  const name = String(req.query.name || '').trim();
  if (!url) return res.status(400).json({ error: 'missing url' });
  if (!isYtUrl(url)) return res.status(400).json({ error: 'not a YouTube URL' });
  if (TOKEN && req.query.token !== TOKEN) {
    return res.status(403).json({ error: 'bad token' });
  }

  const id = videoId(url) || 'beat';
  const clientKey = String(req.query.client || '').trim().toLowerCase();
  const extractorArgs = CLIENT_ARGS[clientKey] || null;
  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytc-'));

    // Cheap duration probe first so long videos fail fast, before any download.
    let duration = 0;
    try {
      const out = await youtubedl(url, {
        ...YTDL_OPTS,
        ...(extractorArgs ? { extractorArgs } : {}),
        print: 'duration',
        noPlaylist: true,
        skipDownload: true
      });
      duration = parseFloat(String(out).trim()) || 0;
    } catch (e) {
      // Non-fatal: some videos can't report duration without download.
    }
    if (duration && duration > MAX_SECONDS) {
      return res
        .status(422)
        .json({ error: `video too long (${Math.round(duration)}s > ${MAX_SECONDS}s)` });
    }

    const raw = path.join(tmpDir, 'audio.m4a');
    await youtubedl(url, {
      ...YTDL_OPTS,
      ...(extractorArgs ? { extractorArgs } : {}),
      format: 'bestaudio/best',
      output: raw,
      noPlaylist: true,
      restrictFilenames: true
    });

    const wav = path.join(tmpDir, 'audio.wav');
    await execFileP(ffmpegPath, [
      '-y',
      '-i', raw,
      '-ac', '2',
      '-ar', '44100',
      '-sample_fmt', 's16',
      wav
    ]);

    const safeName = (name || id).replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || id;
    res.set('Content-Type', 'audio/wav');
    res.set('Content-Disposition', `attachment; filename="${safeName}.wav"`);
    res.flushHeaders();

    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(wav);
      rs.on('error', reject);
      rs.on('end', resolve);
      rs.pipe(res);
    });
  } catch (err) {
    console.error('convert error:', err && err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'conversion failed: ' + (err && err.message) });
    }
    res.end();
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Startup diagnostic: confirm the deno binary exists and runs, so failures are
// easy to spot. Surfaced via GET /health.
function probeDeno() {
  try {
    const out = execFileSync(denoBin, ['--version'], { timeout: 15000 });
    return 'OK: ' + String(out).trim() + ' @ ' + denoBin;
  } catch (e) {
    return 'ERROR: ' + (e && (e.message || e.code || e)) + ' @ ' + denoBin;
  }
}
const DENO_STATUS = probeDeno();
console.log('deno probe:', DENO_STATUS);

app.listen(PORT, '0.0.0.0', () => console.log(`freestyleking converter listening on :${PORT}`));