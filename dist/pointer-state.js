const HOVER_TARGET_SELECTOR = [
  ".brand",
  ".nav a",
  ".hero__footer a",
  ".project__visual",
  ".entry",
  ".social-slot",
].join(", ");

let pointerX = -1;
let pointerY = -1;
let pointerIsPresent = false;
let hoveredElement = null;
let pendingSampleFrame = 0;

function setHoveredElement(nextElement) {
  if (nextElement === hoveredElement) return;

  hoveredElement?.removeAttribute("data-hovered");
  hoveredElement = nextElement;
  hoveredElement?.setAttribute("data-hovered", "");
}

function samplePointerTarget() {
  if (!pointerIsPresent) {
    setHoveredElement(null);
    return;
  }

  const elementAtPointer = document.elementFromPoint(pointerX, pointerY);
  setHoveredElement(elementAtPointer?.closest(HOVER_TARGET_SELECTOR) ?? null);
}

function schedulePointerSample() {
  if (pendingSampleFrame) return;

  pendingSampleFrame = requestAnimationFrame(() => {
    pendingSampleFrame = 0;
    samplePointerTarget();
  });
}

document.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse") return;
  pointerX = event.clientX;
  pointerY = event.clientY;
  pointerIsPresent = true;
  schedulePointerSample();
}, { passive: true });

document.addEventListener("pointerout", (event) => {
  if (event.pointerType === "mouse" && event.relatedTarget === null) {
    pointerIsPresent = false;
    setHoveredElement(null);
  }
}, { passive: true });

window.addEventListener("blur", () => {
  pointerIsPresent = false;
  setHoveredElement(null);
});

window.addEventListener("scroll", schedulePointerSample, { passive: true });
