<?php
require_once __DIR__.'/helpers.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) vws_json(['login'=>false], 400);
$options = vws_options();
$input = json_decode(file_get_contents('php://input', false, null, 0, 8193), true);
$valid = is_array($input) && is_string($input['token'] ?? null) && hash_equals($options['token'], $input['token']) &&
    ($input['account'] ?? '') === $options['account'] && is_string($input['pin'] ?? null) && strlen($input['pin']) <= 512;
if ($valid) {
    $parts = explode('.', $input['pin']);
    $valid = count($parts) === 2 && hash_equals(hash_hmac('sha256', $parts[0], $options['token']), $parts[1]);
    $data = $valid ? json_decode(base64_decode(strtr($parts[0], '-_', '+/'), true) ?: '', true) : null;
    $valid = is_array($data) && ($data['account'] ?? '') === $input['account'] &&
        is_int($data['expires'] ?? null) && $data['expires'] >= time() && $data['expires'] <= time()+300 &&
        is_string($data['user'] ?? null) && ($input['user'] ?? null) === $data['user'];
}
vws_json(['login'=>(bool)$valid]);
