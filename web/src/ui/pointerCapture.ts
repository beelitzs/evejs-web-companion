// Pointer capture for the page's drags (a window's title bar and edges, the dock's and the target panel's edges,
// a split, a column's resize handle).
//
// ⚠ setPointerCapture THROWS for a pointer the browser no longer counts as active: a touch the system cancelled
// between the press and the handler, a pen lifted early, a pointerdown dispatched by script. The throw escaped the
// drag's pointerdown handler and raised the page's error banner (errorOverlay.ts) over whatever the pilot was
// doing. A drag left uncaptured still moves while the pointer stays over its element, so a failed capture is not
// worth a word. releasePointerCapture throws the same way for a pointer it does not hold, so it is asked first.

/** Capture this pointer for the element if the browser still knows it; a drag goes on uncaptured otherwise. */
export function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No active pointer by that id: nothing to capture.
  }
}

/** Let go of this pointer's capture, where the element holds it. */
export function releasePointer(element: Element, pointerId: number): void {
  if (element.hasPointerCapture(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
}
