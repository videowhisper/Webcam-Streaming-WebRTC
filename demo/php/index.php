<?php
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
header('X-Content-Type-Options: nosniff');
$html = file_get_contents(__DIR__.'/index.html');
echo str_replace('<head>', '<head><script>window.videowhisperConfig={configUrl:"./config.php"};</script>', $html);
