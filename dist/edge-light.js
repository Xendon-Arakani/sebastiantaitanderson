const EDGE_REACH = 0.24;
const EDGE_HOVER_TARGET_SELECTOR = [
  ".project__visual",
  ".entry",
  ".social-slot",
].join(", ");
const REVEAL_SELECTOR = ".reveal";

const root = document.documentElement;
const masthead = document.querySelector(".masthead");
const edgeLight = document.querySelector("#edge-light");
const pageCopies = [...document.querySelectorAll(".edge-light__page-copy")];
const sourceHoverTargets = [...document.querySelectorAll(EDGE_HOVER_TARGET_SELECTOR)];
const sourceRevealTargets = [...document.querySelectorAll(`main ${REVEAL_SELECTOR}`)];
const clonedHoverTargets = [];
const clonedRevealTargets = [];
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
    clonedRevealTargets.push([...pageCopy.querySelectorAll(`main ${REVEAL_SELECTOR}`)]);
  });
}

function bindRevealTimelines() {
  const supportsNamedViewTimelines = CSS.supports("view-timeline-name: --edge-reveal")
    && CSS.supports("timeline-scope: --edge-reveal");

  if (!supportsNamedViewTimelines) {
    clonedRevealTargets.flat().forEach((clone) => {
      clone.style.animation = "none";
      clone.style.opacity = "1";
      clone.style.transform = "none";
    });
    edgeLight.dataset.animationSync = "settled-fallback";
    return;
  }

  const timelineNames = sourceRevealTargets.map((_, index) => `--edge-reveal-${index}`);
  document.body.style.setProperty("timeline-scope", timelineNames.join(", "));

  sourceRevealTargets.forEach((source, index) => {
    const timelineName = timelineNames[index];
    source.style.setProperty("view-timeline-name", timelineName);
    source.style.setProperty("view-timeline-axis", "block");
    source.style.setProperty("animation-timeline", timelineName);

    clonedRevealTargets.forEach((targets) => {
      targets[index]?.style.setProperty("animation-timeline", timelineName);
    });
  });

  edgeLight.dataset.animationSync = "named-view-timelines";
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
  const viewportWidth = root.clientWidth;
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
  const layoutHeight = Math.max(
    root.getBoundingClientRect().height,
    document.body.getBoundingClientRect().height,
    window.innerHeight,
  );
  const alignedDocumentHeight = Math.ceil(layoutHeight * pixelRatio) / pixelRatio;
  const alignedViewportHeight = physicalViewportHeight / pixelRatio;
  const alignedBandHeight = physicalBandHeight / pixelRatio;

  root.style.setProperty("--edge-aperture-top", `${physicalMastheadBottom / pixelRatio}px`);
  root.style.setProperty("--edge-document-height", `${alignedDocumentHeight}px`);
  root.style.setProperty("--edge-viewport-height", `${alignedViewportHeight}px`);
  root.style.setProperty("--edge-band-height", `${alignedBandHeight}px`);

  edgeLight.dataset.physicalWidth = String(Math.round(viewportWidth * pixelRatio));
  edgeLight.dataset.physicalHeight = String(physicalApertureHeight);
  edgeLight.dataset.edgeReach = String(EDGE_REACH);
  edgeLight.dataset.source = "self-contained-page-copy";
  edgeLight.dataset.effect = "original-masked-bloom";
  edgeLight.dataset.scrollSync = usesNativeScrollTimeline ? "scroll-timeline" : "native-scroll-event";
  syncFallbackScrollPosition();
}

buildPageCopies();
bindRevealTimelines();

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
