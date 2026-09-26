import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function exportBinaryFile(name: string, blob: Blob, status: (message: string) => void = () => {}): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({ path: name, data: '', directory: Directory.Cache });
      const chunkSize = 3 * 1024 * 1024;
      for (let offset = 0; offset < blob.size; offset += chunkSize) {
        const chunk = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
        let binary = ''; for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
        await Filesystem.appendFile({ path: name, data: btoa(binary), directory: Directory.Cache });
        status(`正在写入备份 ${Math.min(100, Math.round((offset + chunk.length) / blob.size * 100))}%`);
      }
      const file = await Filesystem.getUri({ path: name, directory: Directory.Cache });
      await Share.share({ title: name, files: [file.uri] });
    } catch (error) { await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => {}); throw error; }
    return;
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function exportTextFile(
  name: string,
  text: string,
  options?: { dialogTitle?: string; text?: string }
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({
        title: name,
        text: options?.text || name,
        dialogTitle: options?.dialogTitle || `导出 ${name}`,
        files: [file.uri],
      });
    } catch (shareErr) {
      if (shareErr instanceof Error && /cancel/i.test(shareErr.message)) {
        return;
      }
      throw shareErr;
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
