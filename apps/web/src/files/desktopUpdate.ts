/**
 * Updates for the desktop app. The app asks its native side whether a newer
 * signed release is out (the list lives in the public curvelet-releases
 * repository); the user chooses when to install it, then the app restarts.
 * In a browser there is nothing to do: the service worker updates the web app.
 */
interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}
const tauri = (): TauriInternals | null => (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__ ?? null;

export interface DesktopUpdate {
  version: string;
  notes?: string | null;
}

/** the newer version, or null when this is the latest, when offline, or in a browser */
export async function checkDesktopUpdate(): Promise<DesktopUpdate | null> {
  const native = tauri();
  if (!native) return null;
  try {
    return ((await native.invoke('check_update')) as DesktopUpdate | null) ?? null;
  } catch {
    // no connection, or the release list could not be read: try again next start
    return null;
  }
}

/** downloads and installs the update, then restarts the app; resolves false if it failed */
export async function installDesktopUpdate(): Promise<boolean> {
  const native = tauri();
  if (!native) return false;
  try {
    await native.invoke('install_update');
    return true;
  } catch {
    return false;
  }
}
