export function isNativePlatform(): boolean {
  return !!(window as any).Capacitor
}

export function isAndroid(): boolean {
  if (!isNativePlatform()) return false
  return (window as any).Capacitor.getPlatform() === 'android'
}
