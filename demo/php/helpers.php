<?php
// Optional PHP host for the public demo. No private account token reaches JS.
function vws_json(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function vws_options(): array {
    $file = getenv('VWS_DEMO_CONFIG');
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? __DIR__);
    $real = $file ? realpath($file) : false;
    if (!$real || ($root && str_starts_with($real, $root . '/'))) vws_json(['error'=>'Configure private demo settings outside the web root.'], 503);
    $options = json_decode(file_get_contents($real), true);
    if (!is_array($options) || empty($options['account']) || empty($options['socket']) || strlen($options['token'] ?? '') < 24) vws_json(['error'=>'Demo service configuration unavailable.'], 503);
    return $options;
}
function vws_identity(?string $requested = null): string {
    session_name('vws_demo_' . substr(hash('sha256', __DIR__), 0, 10));
    session_start(['use_strict_mode'=>1, 'cookie_httponly'=>1, 'cookie_samesite'=>'Lax',
        'cookie_secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
    $_SESSION['users'] ??= [];
    foreach ($_SESSION['users'] as $name=>$expires) if ($expires < time()) unset($_SESSION['users'][$name]);
    if ($requested !== null) {
        if (!isset($_SESSION['users'][$requested])) vws_json(['error'=>'Session expired. Reload the page.'], 403);
        session_write_close();
        return $requested;
    }
    if (count($_SESSION['users']) >= 20) vws_json(['error'=>'Too many active demo tabs.'], 429);
    $user = 'Demo_' . bin2hex(random_bytes(8));
    $_SESSION['users'][$user] = time()+3600;
    session_write_close();
    return $user;
}
function vws_pin(string $user, array $options): array {
    $body = rtrim(strtr(base64_encode(json_encode(['user'=>$user, 'account'=>$options['account'], 'expires'=>time()+300])), '+/', '-_'), '=');
    return ['account'=>$options['account'], 'pin'=>$body.'.'.hash_hmac('sha256', $body, $options['token'])];
}
