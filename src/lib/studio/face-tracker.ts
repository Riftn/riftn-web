/**
 * Face tracker
 * ============
 * The one module that touches MediaPipe's face landmarker. Reached only
 * through the dynamic `import()` in ./face-filters, so its weights (~3.6 MB)
 * and the shared tasks-vision WASM cost nothing until someone picks a face
 * filter. Served from our own origin like the person segmenter (see
 * ./segmenter for why): the model lives in public/models under a versioned
 * name, so change the filename when the weights change.
 */

import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { createLogger } from '@/lib/logger';
import { resolveFileset } from './segmenter';

const logger = createLogger('FaceTracker');

/**
 * MediaPipe's face landmarker, float16. Downloaded once from Google's
 * mediapipe-models bucket (face_landmarker/face_landmarker/float16/1) and
 * committed as-is.
 */
export const FACE_LANDMARKER_MODEL_URL = `${import.meta.env.BASE_URL}models/face_landmarker_float16_v1.task`;

/** One face's 478 points, x/y normalised to the frame (0..1). */
export type FaceLandmarks = { x: number; y: number }[];

export interface FaceTracker {
  /** Faces in this frame, at most `MAX_FACES`. */
  detect: (input: TexImageSource, timestampMs: number) => FaceLandmarks[];
  close: () => void;
}

export const MAX_FACES = 2;

export async function createFaceTracker(): Promise<FaceTracker> {
  const fileset = await resolveFileset();
  let lastError: unknown = null;
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const task = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: MAX_FACES,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      logger.info('Face tracker ready', { delegate });
      let lastTimestamp = -1;
      return {
        detect: (input, timestampMs) => {
          // VIDEO mode rejects a timestamp that is not strictly greater than the last one.
          const timestamp = Math.max(Math.floor(timestampMs), lastTimestamp + 1);
          lastTimestamp = timestamp;
          const result = task.detectForVideo(input as never, timestamp);
          return (result.faceLandmarks ?? []).map(face => face.map(point => ({ x: point.x, y: point.y })));
        },
        close: () => task.close(),
      };
    } catch (error) {
      lastError = error;
      logger.warn(`Face tracker could not start on ${delegate}`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The face tracker failed to load.');
}
