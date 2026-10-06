const WIDTH = 128;
const HEIGHT = 1072;
const PIXEL_COUNT = WIDTH * HEIGHT;
const TICKS_PER_SECOND = 24;
const TICK_DURATION = 1000 / TICKS_PER_SECOND;
const TRANSITION_TICKS = 24;
const SELECTION_COUNT = Math.round(PIXEL_COUNT * 0.01);
const FULL_TRANSFER_TICKS = Math.ceil(PIXEL_COUNT / SELECTION_COUNT) + TRANSITION_TICKS;
const FULL_IMAGE_HOLD_TICKS = FULL_TRANSFER_TICKS;

const canvas = document.querySelector("#pixel-background");
const edgeCanvas = document.querySelector("#edge-background");
const imageUrls = [
  "assets/alien-jungle-1.png",
  "assets/alien-jungle-2.png",
  "assets/alien-jungle-3.png",
];

canvas.width = WIDTH;
canvas.height = HEIGHT;
canvas.dataset.selectionSize = String(SELECTION_COUNT);
canvas.dataset.tickRate = String(TICKS_PER_SECOND);
canvas.dataset.presentation = "requestAnimationFrame";
canvas.dataset.fullImageHoldTicks = String(FULL_IMAGE_HOLD_TICKS);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to load ${url}`)), { once: true });
    image.src = url;
  });
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Pixel background shader failed: ${message}`);
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Pixel background program failed: ${message}`);
  }

  return program;
}

function configureTexture(gl) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function createImageTexture(gl, image, unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  configureTexture(gl);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

function createEdgeRenderer(images, initialState) {
  const edgeLight = document.querySelector("#edge-light");
  const masthead = document.querySelector(".masthead");
  const gl = edgeCanvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });

  if (!gl) return null;

  const vertexSource = `#version 300 es
    in vec2 a_position;
    out vec2 v_uv;

    void main() {
      v_uv = (a_position + 1.0) * 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    out vec4 out_color;

    uniform sampler2D u_image_0;
    uniform sampler2D u_image_1;
    uniform sampler2D u_image_2;
    uniform sampler2D u_state;
    uniform float u_tick_mod;
    uniform float u_document_top;
    uniform float u_document_height;
    uniform float u_aperture_height;
    uniform float u_viewport_width;
    uniform float u_blur_radius;

    vec4 image_pixel(int image_index, vec2 uv) {
      if (image_index == 1) return texture(u_image_1, uv);
      if (image_index == 2) return texture(u_image_2, uv);
      return texture(u_image_0, uv);
    }

    vec4 animated_pixel(vec2 uv) {
      vec4 state = texture(u_state, uv);
      int source_index = int(floor(state.r * 255.0 + 0.5));
      int target_index = int(floor(state.g * 255.0 + 0.5));
      float start_tick = floor(state.b * 255.0 + 0.5);
      float is_active = step(0.5, state.a);
      float elapsed_ticks = mod(u_tick_mod - start_tick + 256.0, 256.0);
      float interpolation = is_active * clamp(elapsed_ticks / ${TRANSITION_TICKS.toFixed(1)}, 0.0, 1.0);
      return mix(image_pixel(source_index, uv), image_pixel(target_index, uv), interpolation);
    }

    vec4 composited_pixel(vec2 uv) {
      vec4 art = animated_pixel(clamp(uv, 0.0, 1.0));
      return vec4(mix(art.rgb, vec3(5.0, 8.0, 7.0) / 255.0, 0.46), 1.0);
    }

    void main() {
      float screen_down = 1.0 - v_uv.y;
      float document_y = u_document_top + screen_down * u_aperture_height;
      vec2 document_uv = vec2(v_uv.x, 1.0 - document_y / u_document_height);
      vec2 blur_uv = vec2(u_blur_radius / u_viewport_width, u_blur_radius / u_document_height);

      float edge_distance = min(screen_down, v_uv.y);
      vec4 base_sample = composited_pixel(document_uv);
      vec4 light_sample = base_sample;

      if (edge_distance < 0.28) {
        vec4 blurred = base_sample * 0.227027;
        blurred += composited_pixel(document_uv + vec2( blur_uv.x, 0.0)) * 0.121622;
        blurred += composited_pixel(document_uv + vec2(-blur_uv.x, 0.0)) * 0.121622;
        blurred += composited_pixel(document_uv + vec2(0.0,  blur_uv.y)) * 0.121622;
        blurred += composited_pixel(document_uv + vec2(0.0, -blur_uv.y)) * 0.121622;
        blurred += composited_pixel(document_uv + vec2( blur_uv.x,  blur_uv.y)) * 0.071621;
        blurred += composited_pixel(document_uv + vec2(-blur_uv.x,  blur_uv.y)) * 0.071621;
        blurred += composited_pixel(document_uv + vec2( blur_uv.x, -blur_uv.y)) * 0.071621;
        blurred += composited_pixel(document_uv + vec2(-blur_uv.x, -blur_uv.y)) * 0.071621;
        float blur_amount = 1.0 - smoothstep(0.20, 0.28, edge_distance);
        light_sample = mix(base_sample, blurred, blur_amount);
      }

      float decay_scale = 0.12;
      float top_light = (1.0 - smoothstep(0.15, 0.25, screen_down)) / (1.0 + pow(screen_down / decay_scale, 2.0));
      float bottom_light = (1.0 - smoothstep(0.15, 0.25, v_uv.y)) / (1.0 + pow(v_uv.y / decay_scale, 2.0));
      float falloff = 1.0 - (1.0 - top_light) * (1.0 - bottom_light);
      vec3 filtered = clamp((light_sample.rgb * 3.2 - 0.5) * 1.12 + 0.5, 0.0, 1.0);
      out_color = vec4(filtered * falloff, falloff);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  images.forEach((image, index) => createImageTexture(gl, image, index));
  gl.uniform1i(gl.getUniformLocation(program, "u_image_0"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_image_1"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_image_2"), 2);

  const stateTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, stateTexture);
  configureTexture(gl);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WIDTH, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, initialState);
  gl.uniform1i(gl.getUniformLocation(program, "u_state"), 3);

  const uniforms = {
    tick: gl.getUniformLocation(program, "u_tick_mod"),
    documentTop: gl.getUniformLocation(program, "u_document_top"),
    documentHeight: gl.getUniformLocation(program, "u_document_height"),
    apertureHeight: gl.getUniformLocation(program, "u_aperture_height"),
    viewportWidth: gl.getUniformLocation(program, "u_viewport_width"),
    blurRadius: gl.getUniformLocation(program, "u_blur_radius"),
  };
  const geometry = {
    apertureHeight: 1,
    blurRadius: 8,
    documentHeight: 1,
    mastheadBottom: 0,
    viewportWidth: 1,
  };

  function syncGeometry() {
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const viewportWidth = Math.max(1, document.documentElement.clientWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const mastheadBottom = Math.max(0, masthead.getBoundingClientRect().bottom);
    const apertureHeight = Math.max(1 / pixelRatio, viewportHeight - mastheadBottom);
    const layoutHeight = Math.max(
      document.documentElement.getBoundingClientRect().height,
      document.body.getBoundingClientRect().height,
      viewportHeight,
    );
    const physicalWidth = Math.max(1, Math.round(viewportWidth * pixelRatio));
    const physicalHeight = Math.max(1, Math.round(apertureHeight * pixelRatio));

    if (edgeCanvas.width !== physicalWidth || edgeCanvas.height !== physicalHeight) {
      edgeCanvas.width = physicalWidth;
      edgeCanvas.height = physicalHeight;
      gl.viewport(0, 0, physicalWidth, physicalHeight);
    }

    geometry.viewportWidth = viewportWidth;
    geometry.apertureHeight = apertureHeight;
    geometry.mastheadBottom = mastheadBottom;
    geometry.documentHeight = Math.ceil(layoutHeight * pixelRatio) / pixelRatio;
    geometry.blurRadius = Math.min(16, Math.max(8, viewportHeight * 0.0125));
    edgeCanvas.dataset.physicalWidth = String(physicalWidth);
    edgeCanvas.dataset.physicalHeight = String(physicalHeight);
    edgeCanvas.dataset.presentation = "native-frame";
    edgeCanvas.dataset.scrollSource = "window-scroll-y";
    edgeCanvas.dataset.falloff = "continuous-inverse-square";
  }

  function uploadState(state) {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, state);
  }

  function render(tickModulo) {
    gl.useProgram(program);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.tick, tickModulo);
    gl.uniform1f(uniforms.documentTop, window.scrollY + geometry.mastheadBottom);
    gl.uniform1f(uniforms.documentHeight, geometry.documentHeight);
    gl.uniform1f(uniforms.apertureHeight, geometry.apertureHeight);
    gl.uniform1f(uniforms.viewportWidth, geometry.viewportWidth);
    gl.uniform1f(uniforms.blurRadius, geometry.blurRadius);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const resizeObserver = new ResizeObserver(syncGeometry);
  resizeObserver.observe(edgeLight);
  resizeObserver.observe(masthead);
  window.addEventListener("resize", syncGeometry, { passive: true });
  window.visualViewport?.addEventListener("resize", syncGeometry, { passive: true });
  syncGeometry();

  return { render, uploadState };
}

async function startPixelBackground() {
  const images = await Promise.all(imageUrls.map(loadImage));

  if (images.some((image) => image.naturalWidth !== WIDTH || image.naturalHeight !== HEIGHT)) {
    throw new Error(`All pixel background images must be ${WIDTH}×${HEIGHT}.`);
  }

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
    stencil: false,
  });

  if (!gl) {
    canvas.dataset.renderer = "static-fallback";
    document.documentElement.dataset.edgeBackgroundRenderer = "static";
    return;
  }

  const vertexSource = `#version 300 es
    in vec2 a_position;
    out vec2 v_uv;

    void main() {
      v_uv = (a_position + 1.0) * 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;

    in vec2 v_uv;
    out vec4 out_color;

    uniform sampler2D u_image_0;
    uniform sampler2D u_image_1;
    uniform sampler2D u_image_2;
    uniform sampler2D u_state;
    uniform float u_tick_mod;

    vec4 image_pixel(int image_index, vec2 uv) {
      if (image_index == 1) {
        return texture(u_image_1, uv);
      }
      if (image_index == 2) {
        return texture(u_image_2, uv);
      }
      return texture(u_image_0, uv);
    }

    vec4 animated_pixel(vec2 uv) {
      vec4 state = texture(u_state, uv);
      int source_index = int(floor(state.r * 255.0 + 0.5));
      int target_index = int(floor(state.g * 255.0 + 0.5));
      float start_tick = floor(state.b * 255.0 + 0.5);
      float is_active = step(0.5, state.a);
      float elapsed_ticks = mod(u_tick_mod - start_tick + 256.0, 256.0);
      float interpolation = is_active * clamp(elapsed_ticks / ${TRANSITION_TICKS.toFixed(1)}, 0.0, 1.0);

      vec4 source_color = image_pixel(source_index, uv);
      vec4 target_color = image_pixel(target_index, uv);
      return mix(source_color, target_color, interpolation);
    }

    void main() {
      out_color = animated_pixel(v_uv);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     3, -1,
    -1,  3,
  ]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  images.forEach((image, index) => createImageTexture(gl, image, index));
  gl.uniform1i(gl.getUniformLocation(program, "u_image_0"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_image_1"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_image_2"), 2);

  const initialImage = Math.floor(Math.random() * images.length);
  const sourceIndices = new Uint8Array(PIXEL_COUNT);
  const targetIndices = new Uint8Array(PIXEL_COUNT);
  const startTicks = new Uint8Array(PIXEL_COUNT);
  const activePixels = new Uint8Array(PIXEL_COUNT);
  const stateData = new Uint8Array(PIXEL_COUNT * 4);
  const eligiblePixels = new Uint32Array(PIXEL_COUNT);
  let eligibleCount = 0;
  let activePixelCount = 0;
  const cohorts = [];
  let currentTargetImage = (initialImage + 1 + Math.floor(Math.random() * 2)) % images.length;
  let settledToTarget = 0;
  let targetPhase = 1;
  let settledAtTick = null;
  let settledFrameShown = false;

  sourceIndices.fill(initialImage);
  targetIndices.fill(initialImage);

  for (let pixel = 0; pixel < PIXEL_COUNT; pixel += 1) {
    const offset = pixel * 4;
    stateData[offset] = initialImage;
    stateData[offset + 1] = initialImage;
    stateData[offset + 2] = 0;
    stateData[offset + 3] = 0;
  }

  const stateTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, stateTexture);
  configureTexture(gl);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WIDTH, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, stateData);
  gl.uniform1i(gl.getUniformLocation(program, "u_state"), 3);

  const tickLocation = gl.getUniformLocation(program, "u_tick_mod");
  const edgeRenderer = createEdgeRenderer(images, stateData);

  function writePixelState(pixel) {
    const offset = pixel * 4;
    stateData[offset] = sourceIndices[pixel];
    stateData[offset + 1] = targetIndices[pixel];
    stateData[offset + 2] = startTicks[pixel];
    stateData[offset + 3] = activePixels[pixel] ? 255 : 0;
  }

  function rebuildEligiblePixels() {
    eligibleCount = 0;
    settledToTarget = 0;

    for (let pixel = 0; pixel < PIXEL_COUNT; pixel += 1) {
      if (activePixels[pixel]) continue;

      if (sourceIndices[pixel] === currentTargetImage) {
        settledToTarget += 1;
      } else {
        eligiblePixels[eligibleCount] = pixel;
        eligibleCount += 1;
      }
    }
  }

  function chooseNextTarget() {
    currentTargetImage = (currentTargetImage + 1 + Math.floor(Math.random() * 2)) % images.length;
    targetPhase += 1;
    settledAtTick = null;
    settledFrameShown = false;
    rebuildEligiblePixels();
  }

  function finishCompletedCohorts(simulationTick) {
    while (cohorts.length && cohorts[0].completeAt <= simulationTick) {
      const cohort = cohorts.shift();

      for (const pixel of cohort.pixels) {
        sourceIndices[pixel] = targetIndices[pixel];
        activePixels[pixel] = 0;
        activePixelCount -= 1;
        writePixelState(pixel);

        if (sourceIndices[pixel] === currentTargetImage) {
          settledToTarget += 1;
        } else {
          eligiblePixels[eligibleCount] = pixel;
          eligibleCount += 1;
        }
      }
    }
  }

  function selectNextCohort(simulationTick) {
    const cohortSize = Math.min(SELECTION_COUNT, eligibleCount);
    const pixels = new Uint32Array(cohortSize);

    for (let index = 0; index < cohortSize; index += 1) {
      const eligibleSlot = Math.floor(Math.random() * eligibleCount);
      const pixel = eligiblePixels[eligibleSlot];
      eligibleCount -= 1;
      eligiblePixels[eligibleSlot] = eligiblePixels[eligibleCount];

      targetIndices[pixel] = currentTargetImage;
      startTicks[pixel] = simulationTick % 256;
      activePixels[pixel] = 1;
      activePixelCount += 1;
      pixels[index] = pixel;
      writePixelState(pixel);
    }

    if (cohortSize > 0) {
      cohorts.push({
        completeAt: simulationTick + TRANSITION_TICKS,
        pixels,
      });
    }
  }

  function uploadPixelState() {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, stateData);
    edgeRenderer?.uploadState(stateData);
    canvas.dataset.activePixels = String(activePixelCount);
    canvas.dataset.targetImage = String(currentTargetImage + 1);
    canvas.dataset.targetPhase = String(targetPhase);
    canvas.dataset.targetCompletion = (settledToTarget / PIXEL_COUNT).toFixed(4);
  }

  rebuildEligiblePixels();
  uploadPixelState();

  let simulationTick = 0;
  let accumulator = 0;
  let previousTime = performance.now();

  function render(currentTime) {
    const frameDuration = Math.min(currentTime - previousTime, TICK_DURATION);
    previousTime = currentTime;
    accumulator += frameDuration;

    if (accumulator >= TICK_DURATION) {
      accumulator -= TICK_DURATION;
      simulationTick += 1;

      finishCompletedCohorts(simulationTick);

      if (settledToTarget === PIXEL_COUNT && activePixelCount === 0 && settledAtTick === null) {
        settledAtTick = simulationTick;
      }

      const completedHoldTicks = settledAtTick === null ? 0 : simulationTick - settledAtTick;

      if (settledFrameShown && completedHoldTicks >= FULL_IMAGE_HOLD_TICKS) {
        chooseNextTarget();
      }

      if (settledAtTick === null) {
        selectNextCohort(simulationTick);
      }

      uploadPixelState();
      canvas.dataset.simulationTick = String(simulationTick);
    }

    const fractionalTick = accumulator / TICK_DURATION;
    const tickModulo = (simulationTick + fractionalTick) % 256;
    gl.viewport(0, 0, WIDTH, HEIGHT);
    gl.uniform1f(tickLocation, tickModulo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    edgeRenderer?.render(tickModulo);

    if (settledAtTick !== null) {
      settledFrameShown = true;
    }

    requestAnimationFrame(render);
  }

  document.addEventListener("visibilitychange", () => {
    previousTime = performance.now();
    accumulator = 0;
  });

  canvas.dataset.renderer = "webgl2";
  canvas.dataset.initialImage = String(initialImage + 1);
  edgeCanvas.dataset.renderer = edgeRenderer ? "webgl2" : "static-fallback";
  edgeCanvas.dataset.edgeShader = edgeRenderer ? "physical-pixel-bloom" : "none";
  document.documentElement.dataset.edgeBackgroundRenderer = edgeRenderer ? "webgl2" : "static";
  requestAnimationFrame(render);
}

startPixelBackground().catch((error) => {
  canvas.dataset.renderer = "static-fallback";
  document.documentElement.dataset.edgeBackgroundRenderer = "static";
  console.error(error);
});
