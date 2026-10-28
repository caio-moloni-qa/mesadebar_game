import { SaveData, emptySave, parseSave, serializeSave } from '../../core/progress/Progress';

const KEY = 'mesadebar.progress';

/** The progress save in the browser's storage. Storage can be missing or refuse (a private window, blocked site
 *  data): reads then give a fresh save and writes are dropped, and the game plays on without progress. */
export const SaveStore = {
  load(): SaveData {
    try {
      return parseSave(window.localStorage.getItem(KEY));
    } catch {
      return emptySave();
    }
  },

  save(save: SaveData): boolean {
    try {
      window.localStorage.setItem(KEY, serializeSave(save));
      return true;
    } catch {
      return false;
    }
  },

  /** Offers the save as a .json file, for backing it up or moving it to another browser. */
  export(save: SaveData): void {
    const blob = new Blob([serializeSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `venivium-progresso-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** Asks for a .json save file; resolves the parsed save, or null when cancelled or unreadable. */
  import(): Promise<SaveData | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        try {
          const text = await file.text();
          JSON.parse(text);
          resolve(parseSave(text));
        } catch {
          resolve(null);
        }
      });
      input.click();
    });
  }
};
