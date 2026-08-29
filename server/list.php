<?php
/**
 * Sample directory listing (host-side) — Freestyle King.
 *
 * Deploy target: upload this file to
 *   wp-content/themes/thrive-nouveau/list.php
 * on freestylekingapp.com.
 *
 * It recursively scans the theme folder for *.wav files and returns them as
 * JSON, grouped by directory (relative to the theme root), with a CORS header
 * so the static PWA (vicdrose.github.io/freestyleking) can load the real
 * sample lists at runtime — reproducing what the legacy PHP scandir() emitted.
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

$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);

$samples = array();

foreach ($files as $file) {
    if (!$file->isFile()) {
        continue;
    }
    if (strtolower($file->getExtension()) !== 'wav') {
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
echo json_encode(array('base' => WEB_BASE, 'samples' => $samples));