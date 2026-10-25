/**
 * Shared state for the review and editor screens: loads the original once, keeps a preview
 * renderer, analyses the scene, manages the recipe (with undo/redo) and re-renders the preview at
 * most once per animation frame.
 */
import type { SkImage } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getEdit, getPhoto, type PhotoListItem } from '@/storage/photosRepo';
import { recordSample } from '@/utils/perf';

import type { SceneStats } from './analysis';
import { createRecipe, parseRecipe, resolveParams, type CropAspect, type EditRecipe } from './params';
import { isStyleId, type StyleId } from './presets';
import { decodeSource, PreviewRenderer } from './renderer';

export type SessionStatus = 'loading' | 'ready' | 'error';

export interface EditSession {
  status: SessionStatus;
  error: string | null;
  photo: PhotoListItem | null;
  original: SkImage | null;
  processed: SkImage | null;
  previewSize: { width: number; height: number } | null;
  stats: SceneStats | null;
  recipe: EditRecipe | null;
  /** Records an undo step. */
  commitRecipe: (next: EditRecipe) => void;
  /** Live update while dragging (no undo step). */
  previewRecipe: (next: EditRecipe) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
}

const now = () => globalThis.performance?.now?.() ?? Date.now();

function cropFor(aspect: string | null): CropAspect {
  // 4:3 and 16:9 are produced natively by the camera; 1:1 is a centre crop of a 4:3 capture.
  return aspect === '1:1' ? '1:1' : null;
}

export interface EditSessionOptions {
  /** Start from the photo's current enhanced copy recipe when one exists. */
  resumeCurrentEdit?: boolean;
  defaultStyle: StyleId;
  previewDimension?: number;
  /** Overrides applied to a fresh recipe (e.g. the look chosen on the review screen). */
  initialStyle?: StyleId;
  initialStrength?: number;
}

export function useEditSession(photoId: string | undefined, options: EditSessionOptions): EditSession {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoListItem | null>(null);
  const [original, setOriginal] = useState<SkImage | null>(null);
  const [processed, setProcessed] = useState<SkImage | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [recipe, setRecipe] = useState<EditRecipe | null>(null);
  const [past, setPast] = useState<EditRecipe[]>([]);
  const [future, setFuture] = useState<EditRecipe[]>([]);
  const [initial, setInitial] = useState<string | null>(null);

  const renderer = useRef<PreviewRenderer | null>(null);
  const pending = useRef<EditRecipe | null>(null);
  const frame = useRef<number | null>(null);
  const { resumeCurrentEdit = false, defaultStyle, previewDimension, initialStyle, initialStrength } = options;

  const renderNow = useCallback((next: EditRecipe) => {
    const active = renderer.current;
    if (!active) return;
    const started = now();
    try {
      // Displayed images are not disposed manually: the UI thread may still be drawing them.
      // Skia reports their size to the GC (getMemoryPressure), so they are reclaimed promptly.
      setProcessed(active.render(resolveParams(next)));
      recordSample('Preview render', now() - started);
    } catch (renderError) {
      console.warn('[edit] preview render failed', renderError);
    }
  }, []);

  const schedule = useCallback(
    (next: EditRecipe) => {
      pending.current = next;
      if (frame.current != null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const target = pending.current;
        pending.current = null;
        if (target) renderNow(target);
      });
    },
    [renderNow],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!photoId) throw new Error('No photo selected');
      const record = await getPhoto(photoId);
      if (!record) throw new Error('This photo no longer exists');
      if (cancelled) return;
      setPhoto(record);
      const started = now();
      const bytes = await new File(record.originalUri).bytes();
      if (cancelled) return;
      const source = decodeSource(bytes);
      const crop = cropFor(record.aspect);
      const preview = new PreviewRenderer(source, crop, previewDimension);
      source.image.dispose?.();
      if (cancelled) {
        preview.dispose();
        return;
      }
      renderer.current = preview;
      const analysis = preview.analyze();
      let start: EditRecipe | null = null;
      if (resumeCurrentEdit && record.currentEditId) {
        const edit = await getEdit(record.currentEditId);
        start = parseRecipe(edit?.recipe);
      }
      const styleId = initialStyle ?? (isStyleId(record.styleId) ? record.styleId : defaultStyle);
      if (!start) {
        start = createRecipe(styleId, analysis.auto, crop);
        if (initialStrength != null && Number.isFinite(initialStrength)) {
          start = { ...start, strength: Math.min(1, Math.max(0, initialStrength)) };
        }
      }
      recordSample('Editor open (decode + proxy + analysis)', now() - started);
      if (cancelled) return;
      setStats(analysis.stats);
      setOriginal(preview.original);
      setPreviewSize({ width: preview.width, height: preview.height });
      setRecipe(start);
      setInitial(JSON.stringify(start));
      renderNow(start);
      setStatus('ready');
    }
    load().catch((loadError: unknown) => {
      if (cancelled) return;
      console.warn('[edit] failed to open photo', loadError);
      setError(loadError instanceof Error ? loadError.message : 'The photo could not be opened');
      setStatus('error');
    });
    return () => {
      cancelled = true;
      if (frame.current != null) cancelAnimationFrame(frame.current);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [photoId, resumeCurrentEdit, defaultStyle, previewDimension, initialStyle, initialStrength, renderNow]);

  const previewRecipe = useCallback(
    (next: EditRecipe) => {
      setRecipe(next);
      schedule(next);
    },
    [schedule],
  );

  const commitRecipe = useCallback(
    (next: EditRecipe) => {
      setRecipe((current) => {
        if (current && JSON.stringify(current) !== JSON.stringify(next)) {
          setPast((stack) => [...stack.slice(-49), current]);
          setFuture([]);
        }
        return next;
      });
      schedule(next);
    },
    [schedule],
  );

  const undo = useCallback(() => {
    setPast((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setRecipe((current) => {
        if (current) setFuture((f) => [current, ...f]);
        return previous;
      });
      schedule(previous);
      return stack.slice(0, -1);
    });
  }, [schedule]);

  const redo = useCallback(() => {
    setFuture((stack) => {
      const next = stack[0];
      if (!next) return stack;
      setRecipe((current) => {
        if (current) setPast((p) => [...p, current]);
        return next;
      });
      schedule(next);
      return stack.slice(1);
    });
  }, [schedule]);

  return {
    status,
    error,
    photo,
    original,
    processed,
    previewSize,
    stats,
    recipe,
    commitRecipe,
    previewRecipe,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    dirty: recipe != null && initial != null && JSON.stringify(recipe) !== initial,
  };
}
