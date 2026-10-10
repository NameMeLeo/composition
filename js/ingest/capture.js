/* Composition — getting a report into the app (facade).
   Three doors in: the paste-the-link sheet, the camera scanner, and a shared
   file. The sheet chrome lives here; the camera lives in scanner.js; the
   fetch-and-extract pipeline lives in reading-pipeline.js. All of them end in
   the same place — an extraction handed to the review screen.

   Existing imports of `Capture.*` keep working; new code may import the
   focused modules directly. */

import { $ } from '../core/dom.js';
import {
  openScanner,
  stopScanner,
  toggleTorch,
  scanImageFile,
  onDetected
} from './scanner.js';
import { startReading } from './reading-pipeline.js';

/* ------------------------------------------------------------------ */
/* The link sheet                                                      */
/* ------------------------------------------------------------------ */

function openSheet() {
  $('#sheet-capture').hidden = false;
  const input = $('#in-report-url');
  input.value = '';
  // The sheet exists to take one paste, so it opens with the caret already there.
  window.requestAnimationFrame(() => input.focus());
}

function closeSheet() {
  $('#sheet-capture').hidden = true;
}

export { openScanner, stopScanner, toggleTorch, scanImageFile, onDetected, startReading };

export const Capture = {
  openSheet,
  closeSheet,
  openScanner,
  stopScanner,
  toggleTorch,
  scanImageFile,
  startReading
};
