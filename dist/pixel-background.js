const WIDTH = 128;
const HEIGHT = 1072;
const PIXEL_COUNT = WIDTH * HEIGHT;
const TICKS_PER_SECOND = 24;
const TICK_DURATION = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 2;
const RENDER_FRAMES_PER_SECOND = 60;
const FRAME_DURATION = 1000 / RENDER_FRAMES_PER_SECOND;
const TRANSITION_TICKS = 24;
const SELECTION_COUNT = Math.round(PIXEL_COUNT * 0.01);
const FULL_TRANSFER_TICKS = Math.ceil(PIXEL_COUNT / SELECTION_COUNT) + TRANSITION_TICKS;
const FULL_IMAGE_HOLD_TICKS = FULL_TRANSFER_TICKS;

const canvas = document.querySelector("#pixel-background");
const imageUrls = [
  "assets/alien-jungle-1.png",
  "assets/alien-jungle-2.png",
  "assets/alien-jungle-3.png",
];

canvas.width = WIDTH;
canvas.height = HEIGHT;
canvas.dataset.selectionSize = String(SELECTION_COUNT);
canvas.dataset.tickRate = String(TICKS_PER_SECOND);
canvas.dataset.frameRate = String(RENDER_FRAMES_PER_SECOND);
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

    void main() {
      vec4 state = texture(u_state, v_uv);
      int source_index = int(floor(state.r * 255.0 + 0.5));
      int target_index = int(floor(state.g * 255.0 + 0.5));
      float start_tick = floor(state.b * 255.0 + 0.5);
      float is_active = step(0.5, state.a);
      float elapsed_ticks = mod(u_tick_mod - start_tick + 256.0, 256.0);
      float interpolation = is_active * clamp(elapsed_ticks / ${TRANSITION_TICKS.toFixed(1)}, 0.0, 1.0);

      vec4 source_color = image_pixel(source_index, v_uv);
      vec4 target_color = image_pixel(target_index, v_uv);
      out_color = mix(source_color, target_color, interpolation);
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
    canvas.dataset.activePixels = String(activePixelCount);
    canvas.dataset.targetImage = String(currentTargetImage + 1);
    canvas.dataset.targetPhase = String(targetPhase);
    canvas.dataset.targetCompletion = (settledToTarget / PIXEL_COUNT).toFixed(4);
  }

  rebuildEligiblePixels();
  uploadPixelState();

  let simulationTick = 0;
  let accumulator = 0;
  let frameAccumulator = FRAME_DURATION;
  let previousTime = performance.now();

  function render(currentTime) {
    const frameDuration = Math.min(currentTime - previousTime, 250);
    previousTime = currentTime;
    accumulator += frameDuration;
    frameAccumulator += frameDuration;
    let processedTicks = 0;

    while (accumulator >= TICK_DURATION && processedTicks < MAX_TICKS_PER_FRAME) {
      accumulator -= TICK_DURATION;
      simulationTick += 1;
      processedTicks += 1;

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

    }

    if (accumulator >= TICK_DURATION) {
      accumulator %= TICK_DURATION;
    }

    if (processedTicks > 0) {
      uploadPixelState();
      canvas.dataset.simulationTick = String(simulationTick);
    }

    if (frameAccumulator >= FRAME_DURATION) {
      frameAccumulator %= FRAME_DURATION;
      const fractionalTick = accumulator / TICK_DURATION;
      const tickModulo = (simulationTick + fractionalTick) % 256;
      gl.viewport(0, 0, WIDTH, HEIGHT);
      gl.uniform1f(tickLocation, tickModulo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (settledAtTick !== null) {
        settledFrameShown = true;
      }
    }

    requestAnimationFrame(render);
  }

  document.addEventListener("visibilitychange", () => {
    previousTime = performance.now();
    accumulator = 0;
    frameAccumulator = FRAME_DURATION;
  });

  canvas.dataset.renderer = "webgl2";
  canvas.dataset.initialImage = String(initialImage + 1);
  requestAnimationFrame(render);
}

startPixelBackground().catch((error) => {
  canvas.dataset.renderer = "static-fallback";
  console.error(error);
});
