<?php
/**
 * Sample directory listing (host-side) — Freestyle King.
 *
 * Deploy target: upload this file to
 *   wp-content/themes/thrive-nouveau/list.php
 * on freestylekingapp.com.
 *
 * It recursively scans the theme folder for audio files (wav/mp3/m4a/aac/ogg/
 * flac/opus/wma, optionally overridden via ?ext=...) and returns them as JSON,
 * grouped by directory (relative to the theme root), with a CORS header so the
 * static PWA (vicdrose.github.io/freestyleking) can load the real sample lists
 * at runtime — reproducing what the legacy PHP scandir() emitted.
 *
 * Response shape:
 *   {
 *     "base": "./wp-content/themes/thrive-nouveau",
 *     "samples": {
 *       "breaks":   ["./wp-content/themes/thrive-nouveau/breaks/a.wav", ...],
 *       "samples/pads": [...],
 *       ...
 *     }
 *   }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=60');

const WEB_BASE = './wp-content/themes/thrive-nouveau';

$root = __DIR__;

$allowed = isset($_GET['ext'])
    ? array_map('strtolower', array_map('trim', explode(',', $_GET['ext'])))
    : array('wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'wma');

// ?get=<relative path> relays an audio file back with a CORS header, because the
// raw media URLs the theme folder serves carry no Access-Control-Allow-Origin
// and would be blocked by the cross-origin PWA during WebAudio decoding.
if (isset($_GET['get'])) {
    $wanted = str_replace('\\', '/', rawurldecode((string) $_GET['get']));
    if (strpos($wanted, WEB_BASE . '/') === 0) {
        $candidate = realpath($root . '/' . substr($wanted, strlen(WEB_BASE) + 1));
        $rootSlash = str_replace('\\', '/', $root) . '/';
        if ($candidate !== false && strpos(str_replace('\\', '/', $candidate), $rootSlash) === 0) {
            $ext = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));
            if (in_array($ext, $allowed, true)) {
                $mime = array(
                    'wav' => 'audio/wav',
                    'mp3' => 'audio/mpeg',
                    'm4a' => 'audio/mp4',
                    'aac' => 'audio/aac',
                    'ogg' => 'audio/ogg',
                    'flac' => 'audio/flac',
                    'opus' => 'audio/ogg',
                    'wma' => 'audio/x-ms-wma'
                );
                header('Content-Type: ' . (isset($mime[$ext]) ? $mime[$ext] : 'application/octet-stream'));
                header('Access-Control-Allow-Origin: *');
                header('Cache-Control: public, max-age=3600');
                header_remove('X-Powered-By');
                readfile($candidate);
                exit;
            }
        }
    }
    http_response_code(404);
    exit;
}

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);

$samples = array();

foreach ($files as $file) {
    if (!$file->isFile()) {
        continue;
    }
    if (!in_array(strtolower($file->getExtension()), $allowed, true)) {
        continue;
    }
    $abs = str_replace('\\', '/', $file->getPathname());
    $dir = str_replace('\\', '/', $root);
    if (strpos($abs, $dir . '/') === 0) {
        $rel = substr($abs, strlen($dir) + 1);
    } else {
        continue;
    }
    $group = ltrim(dirname($rel), '/');
    if ($group === '') {
        $group = '.';
    }
    $samples[$group][] = WEB_BASE . '/' . $rel;
}

foreach ($samples as $group => $list) {
    sort($list, SORT_STRING);
    $samples[$group] = array_values($list);
}

ksort($samples);

header_remove('X-Powered-By');
echo json_encode(array('base' => WEB_BASE, 'exts' => $allowed, 'samples' => $samples));