<?php
require_once __DIR__.'/helpers.php';
$options = vws_options();
if (isset($_GET['user'])) {
    if (!is_string($_GET['user'])) vws_json(['error'=>'Invalid user.'], 400);
    $user = vws_identity($_GET['user']);
    vws_json(['vwsAuth'=>vws_pin($user, $options)]);
}
$user = vws_identity();
$config = json_decode(file_get_contents(__DIR__.'/unconfigured.json'), true);
if (!is_array($config)) vws_json(['error'=>'Public demo template unavailable.'], 503);
unset($config['deny']);
$config['username'] = $user;
$config['development'] = false;
$config['configLock'] = ['username', 'videowhisperServer', 'development'];
$config['videowhisperServer'] = ['socket'=>$options['socket'], 'authentication'=>'pin',
    'user'=>$user, 'credentialsURL'=>'./config.php?user='.rawurlencode($user)] + vws_pin($user, $options);
vws_json($config);
