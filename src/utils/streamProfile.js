export const FREE_PROFILE=Object.freeze({width:640,height:360,framerate:15,videoBitrate:750,audioBitrate:32});
export function normalizeStream() { return {...FREE_PROFILE}; }
export async function applySenderProfile(connection, profile) {
 await Promise.all(connection.getSenders().map(async sender => {
  if (!sender.track) return;
  const params=sender.getParameters(); if(!params.encodings?.length) params.encodings=[{}];
  for(const encoding of params.encodings) {
   encoding.maxBitrate=(sender.track.kind==='audio'?profile.audioBitrate:profile.videoBitrate)*1000;
   if(sender.track.kind==='video') { encoding.maxFramerate=profile.framerate; const actual=sender.track.getSettings();encoding.scaleResolutionDownBy=Math.max(1,(actual.width||profile.width)/profile.width,(actual.height||profile.height)/profile.height); }
  }
  await sender.setParameters(params);
 }));
}

export async function acquireMedia(devices,constraints) {
 try {return await devices.getUserMedia(constraints);} catch(error) {
  if(error.name!=='OverconstrainedError'||!constraints.video||error.constraint==='deviceId')throw error;
  const video={...constraints.video};for(const key of ['width','height','frameRate'])if(video[key]&&typeof video[key]==='object')video[key]={ideal:video[key].ideal};
  return devices.getUserMedia({...constraints,video});
 }
}
