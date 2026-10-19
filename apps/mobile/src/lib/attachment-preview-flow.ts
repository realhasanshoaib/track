/** Publish local previews immediately, then prepare the upload source off-frame. */
export type AttachmentPreparationTask = {
  cancel: () => void;
  done: Promise<void>;
};

type PreparationEntry = {
  original: { id: string };
  promise: Promise<{ id: string }>;
  resolve: (file: { id: string }) => void;
  settled: boolean;
};

const preparationById = new Map<string, PreparationEntry>();
const MaxRememberedPreparations = 100;

function createPreparationEntry<File extends { id: string }>(file: File) {
  let resolvePromise!: (prepared: File) => void;
  const promise = new Promise<File>((resolve) => { resolvePromise = resolve; });
  const entry: PreparationEntry = {
    original: file,
    promise: promise as Promise<{ id: string }>,
    resolve: (prepared) => {
      if (entry.settled) return;
      entry.settled = true;
      resolvePromise(prepared as File);
    },
    settled: false,
  };
  return { entry, promise };
}

function rememberPreparation(id: string, entry: PreparationEntry) {
  preparationById.delete(id);
  preparationById.set(id, entry);
  while (preparationById.size > MaxRememberedPreparations) {
    const oldestId = preparationById.keys().next().value;
    if (!oldestId) return;
    const oldest = preparationById.get(oldestId);
    preparationById.delete(oldestId);
    if (oldest && !oldest.settled) oldest.resolve(oldest.original);
  }
}

/** Wait for the already-running image optimization when Send is tapped early. */
export function resolvePreparedAttachment<File extends { id: string }>(file: File): Promise<File> {
  const entry = preparationById.get(file.id);
  return entry ? entry.promise as Promise<File> : Promise.resolve(file);
}

/** Drop an unused preparation result when a person removes its attachment. */
export function releasePreparedAttachment(id: string) {
  preparationById.delete(id);
}

export function publishFilesBeforePreparation<File extends { id: string }>(
  files: File[],
  publish: (files: File[]) => void,
  prepare: (file: File) => Promise<File>,
  onPrepared: (file: File) => void,
  schedule: (task: () => void) => unknown = (task) => setTimeout(task, 32),
): AttachmentPreparationTask {
  let cancelled = false;
  let finish!: () => void;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const entries = new Map<string, { entry: PreparationEntry; original: File }>();

  for (const file of files) {
    if (!('contentType' in file) || typeof file.contentType !== 'string' || !file.contentType.startsWith('image/')) continue;
    const { entry } = createPreparationEntry(file);
    entries.set(file.id, { entry, original: file });
    rememberPreparation(file.id, entry);
  }

  try {
    publish(files);
  } catch (error) {
    for (const [id, { entry, original }] of entries) {
      if (preparationById.get(id) === entry) preparationById.delete(id);
      entry.resolve(original);
    }
    throw error;
  }

  const runPreparation = () => {
    void (async () => {
      try {
        for (const file of files) {
          if (cancelled) break;
          let prepared = file;
          try {
            prepared = await prepare(file);
          } catch {
            // Keep the immediately visible local image if native processing fails.
          }
          if (!cancelled && prepared !== file) onPrepared(prepared);
          entries.get(file.id)?.entry.resolve(prepared);
        }
      } finally {
        for (const [id, { entry, original }] of entries) {
          if (preparationById.get(id) === entry && !entry.settled) entry.resolve(original);
        }
        finish();
      }
    })();
  };

  try {
    schedule(runPreparation);
  } catch {
    runPreparation();
  }

  return {
    cancel: () => {
      cancelled = true;
      for (const [id, { entry, original }] of entries) {
        if (preparationById.get(id) === entry) preparationById.delete(id);
        entry.resolve(original);
      }
    },
    done,
  };
}
