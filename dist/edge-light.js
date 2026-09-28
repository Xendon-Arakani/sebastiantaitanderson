const EDGE_REACH = 0.24;

const root = document.documentElement;
const masthead = document.querySelector(".masthead");
const edgeLight = document.querySelector("#edge-light");

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

  root.style.setProperty("--edge-aperture-top", `${physicalMastheadBottom / pixelRatio}px`);

  edgeLight.dataset.physicalWidth = String(Math.round(window.innerWidth * pixelRatio));
  edgeLight.dataset.physicalHeight = String(physicalApertureHeight);
  edgeLight.dataset.edgeReach = String(EDGE_REACH);
  edgeLight.dataset.source = "composited-page";
  edgeLight.dataset.effect = "original-masked-bloom";
}

const resizeObserver = new ResizeObserver(syncEdgeLightGeometry);
resizeObserver.observe(masthead);
window.addEventListener("resize", syncEdgeLightGeometry, { passive: true });
window.visualViewport?.addEventListener("resize", syncEdgeLightGeometry, { passive: true });

syncEdgeLightGeometry();
