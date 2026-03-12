/**
 * Returns true when running in a browser on a mobile or tablet device.
 * Used to show the camera scanner on web only for phones/tablets, not desktop.
 * On native (iOS/Android) the camera is always allowed when permission is granted.
 */
export function isMobileOrTabletWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
}
