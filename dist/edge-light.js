const EDGE_REACH = 0.24;
const EDGE_HOVER_TARGET_SELECTOR = [
  ".project__visual",
  ".entry",
  ".social-slot",
].join(", ");

const root = document.documentElement;
const masthead = document.querySelector(".masthead");
const edgeLight = document.querySelector("#edge-light");
const pageCopies = [...document.querySelectorAll(".edge-light__page-copy")];
const sourceHoverTargets = [...document.querySelectorAll(EDGE_HOVER_TARGET_SELECTOR)];
const clonedHoverTargets = [];
const usesNativeScrollTimeline = CSS.supports("animation-timeline: scroll()");

function removeDuplicateIds(scope) {
  scope.removeAttribute("id");
  scope.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
}

function buildPageCopies() {
  const visualSources = [
    document.querySelector("main"),
    document.querySelector(".footer"),
  ];

  pageCopies.forEach((pageCopy) => {
    pageCopy.inert = true;

    const staticBackground = document.createElement("div");
    staticBackground.className = "edge-light__static-background";
    pageCopy.append(staticBackground);

    visualSources.forEach((source) => {
      const clone = source.cloneNode(true);
      removeDuplicateIds(clone);
      pageCopy.append(clone);
    });

    clonedHoverTargets.push([...pageCopy.querySelectorAll(EDGE_HOVER_TARGET_SELECTOR)]);
  });
}

function syncHoverState() {
  sourceHoverTargets.forEach((source, index) => {
    const isHovered = source.hasAttribute("data-hovered");
    clonedHoverTargets.forEach((targets) => {
      targets[index]?.toggleAttribute("data-hovered", isHovered);
    });
  });
}

function syncFallbackScrollPosition() {
  if (usesNativeScrollTimeline) return;

  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const alignedScrollY = Math.round(window.scrollY * pixelRatio) / pixelRatio;
  root.style.setProperty("--edge-scroll-y", `${alignedScrollY}px`);
}

function syncEdgeLightGeometry() {
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const physicalViewportHeight = Math.max(1, Math.round(window.innerHeight * pixelRatio));
  const physicalMastheadBottom = Math.max(
    0,
    Math.min(
      physicalViewportHeight - 1,
      Math.round(masthead.getBoundingClientRect().bottom * pixelRatio),
    ),
  );
  const physicalApertureHeight = physicalViewportHeight - physicalMastheadBottom;
  const physicalBandHeight = Math.max(1, Math.round(physicalApertureHeight * EDGE_REACH));
  const documentHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    window.innerHeight,
  );
  const alignedDocumentHeight = Math.round(documentHeight * pixelRatio) / pixelRatio;
  const alignedViewportHeight = physicalViewportHeight / pixelRatio;

  root.style.setProperty("--edge-aperture-top", `${physicalMastheadBottom / pixelRatio}px`);
  root.style.setProperty("--edge-sample-height", `${1 / pixelRatio}px`);
  root.style.setProperty("--edge-sample-scale", String(physicalBandHeight));
  root.style.setProperty("--edge-document-height", `${alignedDocumentHeight}px`);
  root.style.setProperty("--edge-viewport-height", `${alignedViewportHeight}px`);

  edgeLight.dataset.physicalWidth = String(Math.round(window.innerWidth * pixelRatio));
  edgeLight.dataset.physicalHeight = String(physicalApertureHeight);
  edgeLight.dataset.sampleRows = "1";
  edgeLight.dataset.edgeReach = String(EDGE_REACH);
  edgeLight.dataset.foregroundSource = "browser-raster";
  edgeLight.dataset.scrollSync = usesNativeScrollTimeline ? "scroll-timeline" : "native-scroll-event";
  syncFallbackScrollPosition();
}

buildPageCopies();

const resizeObserver = new ResizeObserver(syncEdgeLightGeometry);
resizeObserver.observe(masthead);
window.addEventListener("resize", syncEdgeLightGeometry, { passive: true });
window.visualViewport?.addEventListener("resize", syncEdgeLightGeometry, { passive: true });
window.addEventListener("scroll", syncFallbackScrollPosition, { passive: true });

const hoverObserver = new MutationObserver(syncHoverState);
sourceHoverTargets.forEach((target) => {
  hoverObserver.observe(target, { attributes: true, attributeFilter: ["data-hovered"] });
});

syncEdgeLightGeometry();
syncHoverState();
