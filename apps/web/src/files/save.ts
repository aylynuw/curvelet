/**
 * Saving a file the app made (an exported figure, a project). In a browser it
 * downloads; in the desktop app, whose web view can't download, it asks the
 * app to show the system's Save dialog and write the file there.
 */
export type SaveResult = 'saved' | 'downloaded' | 'cancelled' | 'failed';

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}
const tauri = (): TauriInternals | null => (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__ ?? null;

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function saveBlob(blob: Blob, name: string): Promise<SaveResult> {
  const native = tauri();
  if (native) {
    try {
      const path = await native.invoke('save_file', { name, data: await base64(blob) });
      return path ? 'saved' : 'cancelled';
    } catch {
      return 'failed';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
