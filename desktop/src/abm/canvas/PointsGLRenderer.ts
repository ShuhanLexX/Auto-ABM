/**
 * WebGL2 points/network renderer (simulation-canvas.md §2, §6).
 *
 * Nodes are drawn as a single `gl.POINTS` call (one vertex per node, rounded in
 * the fragment shader); edges as one batched `gl.LINES` drawElements over the
 * same position buffer. Layout + edges upload once; each frame only re-uploads
 * the per-node state byte. Colours resolve in-shader from a palette uniform, so
 * frames carry only state. Camera is an orthographic uniform mapping the unit
 * world square to display pixels, matching GridRasterRenderer's fit/centre.
 *
 * Degrades gracefully: if WebGL2 is unavailable `ok` is false and the caller
 * falls back (e.g. to a sampled Canvas2D view). Handles context loss/restore.
 */

import { hexToRgb, colorHexForPaletteValue } from './paletteLUT'
import { IDENTITY_CAMERA, type Camera } from './camera'

const MAX_PALETTE = 32

const POINT_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
in float a_state;
uniform vec2 u_origin;
uniform vec2 u_drawSize;
uniform vec2 u_viewport;
uniform float u_layoutScale;
uniform float u_pointSize;
uniform int u_paletteSize;
uniform vec3 u_palette[${MAX_PALETTE}];
out vec3 v_color;
out float v_visible;
out float v_shape;
void main() {
  vec2 p = (a_pos - vec2(0.5)) * u_layoutScale + vec2(0.5);
  vec2 pixel = u_origin + p * u_drawSize;
  vec2 clip = vec2(pixel.x / u_viewport.x * 2.0 - 1.0, 1.0 - pixel.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  int s = int(a_state + 0.5);
  if (s >= 0 && s < u_paletteSize) {
    v_color = u_palette[s];
    v_visible = 1.0;
    v_shape = mod(float(s) + mod(float(gl_VertexID), 5.0), 5.0);
    float jitter = 0.78 + mod(float(gl_VertexID) * 13.0, 9.0) / 20.0;
    gl_PointSize = u_pointSize * jitter;
  } else {
    v_color = vec3(0.0);
    v_visible = 0.0;
    v_shape = 0.0;
    gl_PointSize = 0.0;
  }
}`

const POINT_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_visible;
in float v_shape;
out vec4 frag;
void main() {
  if (v_visible < 0.5) discard;
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float alpha = 0.0;

  if (v_shape < 1.0) {
    alpha = 1.0 - smoothstep(0.78, 0.92, length(p));
  } else if (v_shape < 2.0) {
    alpha = 1.0 - smoothstep(0.78, 0.94, max(abs(p.x), abs(p.y)));
  } else if (v_shape < 3.0) {
    float tri = max(abs(p.x) * 0.82 + p.y * 0.55, -p.y * 0.92);
    alpha = 1.0 - smoothstep(0.48, 0.58, tri);
  } else if (v_shape < 4.0) {
    alpha = 1.0 - smoothstep(0.78, 0.94, abs(p.x) + abs(p.y));
  } else {
    float head = 1.0 - smoothstep(0.20, 0.28, length(p - vec2(0.0, -0.42)));
    float torso = (1.0 - smoothstep(0.18, 0.27, abs(p.x))) * (1.0 - smoothstep(0.48, 0.64, abs(p.y - 0.10)));
    float arms = (1.0 - smoothstep(0.10, 0.18, abs(p.y + 0.02))) * (1.0 - smoothstep(0.58, 0.72, abs(p.x)));
    float legs = max(
      (1.0 - smoothstep(0.10, 0.18, abs(p.x - 0.18))) * (1.0 - smoothstep(0.42, 0.62, abs(p.y - 0.55))),
      (1.0 - smoothstep(0.10, 0.18, abs(p.x + 0.18))) * (1.0 - smoothstep(0.42, 0.62, abs(p.y - 0.55)))
    );
    alpha = max(max(head, torso), max(arms, legs));
  }

  if (alpha < 0.05) discard;
  vec3 lit = mix(v_color * 0.72, min(v_color * 1.2, vec3(1.0)), alpha);
  frag = vec4(lit, alpha);
}`

const EDGE_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
uniform vec2 u_origin;
uniform vec2 u_drawSize;
uniform vec2 u_viewport;
uniform float u_layoutScale;
void main() {
  vec2 p = (a_pos - vec2(0.5)) * u_layoutScale + vec2(0.5);
  vec2 pixel = u_origin + p * u_drawSize;
  vec2 clip = vec2(pixel.x / u_viewport.x * 2.0 - 1.0, 1.0 - pixel.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`

const EDGE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 frag;
void main() { frag = u_color; }`

// Highlight overlay: rings around the selected node (larger) and its direct
// neighbors (smaller), drawn on top of the normal point cloud so a click reads
// as "this node + everything it connects to".
const HL_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
in float a_kind;
uniform vec2 u_origin;
uniform vec2 u_drawSize;
uniform vec2 u_viewport;
uniform float u_layoutScale;
uniform float u_pointSize;
out float v_kind;
void main() {
  vec2 p = (a_pos - vec2(0.5)) * u_layoutScale + vec2(0.5);
  vec2 pixel = u_origin + p * u_drawSize;
  vec2 clip = vec2(pixel.x / u_viewport.x * 2.0 - 1.0, 1.0 - pixel.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_kind = a_kind;
  gl_PointSize = u_pointSize * (a_kind > 1.5 ? 3.4 : 2.3);
}`

const HL_FRAG = `#version 300 es
precision highp float;
in float v_kind;
uniform vec3 u_selColor;
uniform vec3 u_neighborColor;
out vec4 frag;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float ring = (1.0 - smoothstep(0.9, 1.0, r)) * smoothstep(0.5, 0.66, r);
  if (ring < 0.04) discard;
  vec3 c = v_kind > 1.5 ? u_selColor : u_neighborColor;
  frag = vec4(c, ring);
}`

interface GLResources {
  pointProgram: WebGLProgram
  edgeProgram: WebGLProgram
  hlProgram: WebGLProgram
  posBuffer: WebGLBuffer
  stateBuffer: WebGLBuffer
  edgeBuffer: WebGLBuffer | null
  hlPosBuffer: WebGLBuffer
  hlKindBuffer: WebGLBuffer
  hlEdgeBuffer: WebGLBuffer
  pointVao: WebGLVertexArrayObject
  edgeVao: WebGLVertexArrayObject
  hlPointVao: WebGLVertexArrayObject
  hlEdgeVao: WebGLVertexArrayObject
}

export interface NetworkRenderStyle {
  nodeScale: number
  edgeOpacity: number
  edgeWidth: number
  layoutScale: number
  edgeColor: [number, number, number]
}

export const DEFAULT_NETWORK_RENDER_STYLE: NetworkRenderStyle = {
  nodeScale: 1.32,
  // Lighter, more transparent edges keep dense graphs from reading as a solid
  // block while nodes stay the visual focus.
  edgeOpacity: 0.42,
  edgeWidth: 1.1,
  // Kernel layouts keep margins inside the unit square; spreading them out by
  // default gives researchers a more readable opening view.
  layoutScale: 1.2,
  edgeColor: [210 / 255, 218 / 255, 230 / 255],
}

export class PointsGLRenderer {
  private gl: WebGL2RenderingContext | null
  private res: GLResources | null = null
  private readonly paletteFlat: Float32Array
  private readonly paletteSize: number
  private contextLost = false

  // Selection highlight (set via setHighlight). Precomputed once, uploaded when
  // the selection changes, and re-drawn on every frame/camera change.
  private readonly adjacency: Map<number, number[]>
  private selected: number | null = null
  private hlKindCount = 0
  private hlEdgeCount = 0

  constructor(
    private readonly display: HTMLCanvasElement,
    private layout: Float32Array,
    private readonly edges: Uint32Array,
    palette: number | readonly string[],
  ) {
    const labels = typeof palette === 'number' ? null : palette
    const paletteSize = typeof palette === 'number' ? palette : palette.length
    this.paletteSize = Math.min(paletteSize, MAX_PALETTE)
    this.paletteFlat = new Float32Array(MAX_PALETTE * 3)
    for (let i = 0; i < this.paletteSize; i++) {
      const [r, g, b] = hexToRgb(colorHexForPaletteValue(labels?.[i], i))
      this.paletteFlat[i * 3] = r / 255
      this.paletteFlat[i * 3 + 1] = g / 255
      this.paletteFlat[i * 3 + 2] = b / 255
    }

    this.adjacency = buildAdjacency(this.edges, this.layout.length / 2)

    this.gl = display.getContext('webgl2', { antialias: true, alpha: true })
    display.addEventListener('webglcontextlost', this.onContextLost)
    display.addEventListener('webglcontextrestored', this.onContextRestored)
    if (this.gl) this.res = this.build(this.gl)
  }

  /** Direct neighbors of a node (undirected), for the selection card summary. */
  neighborsOf(index: number): number[] {
    return this.adjacency.get(index) ?? []
  }

  /**
   * Replace node positions with a client-computed layout (same node count). The
   * shared position buffer feeds points, edges, and the highlight overlay, so a
   * single re-upload restyles the whole graph. Layout is presentational only —
   * it never touches simulation state. Caller triggers a redraw.
   */
  updateLayout(layout: Float32Array): void {
    if (layout.length !== this.layout.length) return
    this.layout = layout
    const gl = this.gl
    const res = this.res
    if (!gl || !res) return
    gl.bindBuffer(gl.ARRAY_BUFFER, res.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.layout, gl.STATIC_DRAW)
    if (this.selected !== null) this.setHighlight(this.selected)
  }

  get ok(): boolean {
    return this.gl !== null && this.res !== null && !this.contextLost
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
    this.res = null
  }

  private onContextRestored = (): void => {
    if (!this.gl) return
    this.contextLost = false
    this.res = this.build(this.gl)
    // Re-upload the highlight overlay lost with the old context.
    if (this.selected !== null) this.setHighlight(this.selected)
  }

  private build(gl: WebGL2RenderingContext): GLResources | null {
    const pointProgram = createProgram(gl, POINT_VERT, POINT_FRAG)
    const edgeProgram = createProgram(gl, EDGE_VERT, EDGE_FRAG)
    const hlProgram = createProgram(gl, HL_VERT, HL_FRAG)
    if (!pointProgram || !edgeProgram || !hlProgram) return null

    const posBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.layout, gl.STATIC_DRAW)

    const stateBuffer = gl.createBuffer()!

    let edgeBuffer: WebGLBuffer | null = null
    if (this.edges.length > 0) {
      edgeBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.edges, gl.STATIC_DRAW)
    }

    const pointVao = gl.createVertexArray()!
    gl.bindVertexArray(pointVao)
    const posLoc = gl.getAttribLocation(pointProgram, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    const stateLoc = gl.getAttribLocation(pointProgram, 'a_state')
    gl.bindBuffer(gl.ARRAY_BUFFER, stateBuffer)
    gl.enableVertexAttribArray(stateLoc)
    // UNSIGNED_BYTE, un-normalized -> float attribute receives 0..255 directly.
    gl.vertexAttribPointer(stateLoc, 1, gl.UNSIGNED_BYTE, false, 0, 0)

    const edgeVao = gl.createVertexArray()!
    gl.bindVertexArray(edgeVao)
    const edgePosLoc = gl.getAttribLocation(edgeProgram, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    gl.enableVertexAttribArray(edgePosLoc)
    gl.vertexAttribPointer(edgePosLoc, 2, gl.FLOAT, false, 0, 0)
    if (edgeBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer)

    // Highlight point ring pass: its own position + kind buffers (uploaded on
    // selection), and an incident-edge element buffer over the shared posBuffer.
    const hlPosBuffer = gl.createBuffer()!
    const hlKindBuffer = gl.createBuffer()!
    const hlEdgeBuffer = gl.createBuffer()!

    const hlPointVao = gl.createVertexArray()!
    gl.bindVertexArray(hlPointVao)
    const hlPosLoc = gl.getAttribLocation(hlProgram, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, hlPosBuffer)
    gl.enableVertexAttribArray(hlPosLoc)
    gl.vertexAttribPointer(hlPosLoc, 2, gl.FLOAT, false, 0, 0)
    const hlKindLoc = gl.getAttribLocation(hlProgram, 'a_kind')
    gl.bindBuffer(gl.ARRAY_BUFFER, hlKindBuffer)
    gl.enableVertexAttribArray(hlKindLoc)
    gl.vertexAttribPointer(hlKindLoc, 1, gl.FLOAT, false, 0, 0)

    const hlEdgeVao = gl.createVertexArray()!
    gl.bindVertexArray(hlEdgeVao)
    const hlEdgePosLoc = gl.getAttribLocation(edgeProgram, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    gl.enableVertexAttribArray(hlEdgePosLoc)
    gl.vertexAttribPointer(hlEdgePosLoc, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, hlEdgeBuffer)

    gl.bindVertexArray(null)
    return {
      pointProgram,
      edgeProgram,
      hlProgram,
      posBuffer,
      stateBuffer,
      edgeBuffer,
      hlPosBuffer,
      hlKindBuffer,
      hlEdgeBuffer,
      pointVao,
      edgeVao,
      hlPointVao,
      hlEdgeVao,
    }
  }

  /**
   * Set (or clear) the highlighted node. Uploads the selected node + its direct
   * neighbors as ring vertices and their incident edges as a bright overlay.
   * Pass null to clear. Caller triggers a redraw.
   */
  setHighlight(index: number | null): void {
    const nodeCount = this.layout.length / 2
    if (index === null || index < 0 || index >= nodeCount) {
      this.selected = null
      this.hlKindCount = 0
      this.hlEdgeCount = 0
      return
    }
    this.selected = index
    const neighbors = this.adjacency.get(index) ?? []

    // Ring vertices: selected first (kind=2), then unique neighbors (kind=1).
    const positions = new Float32Array((neighbors.length + 1) * 2)
    const kinds = new Float32Array(neighbors.length + 1)
    positions[0] = this.layout[index * 2] ?? 0
    positions[1] = this.layout[index * 2 + 1] ?? 0
    kinds[0] = 2
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i]!
      positions[(i + 1) * 2] = this.layout[n * 2] ?? 0
      positions[(i + 1) * 2 + 1] = this.layout[n * 2 + 1] ?? 0
      kinds[i + 1] = 1
    }
    this.hlKindCount = neighbors.length + 1

    // Incident edges (both endpoints kept so drawElements LINES works).
    const incident = new Uint32Array(neighbors.length * 2)
    for (let i = 0; i < neighbors.length; i++) {
      incident[i * 2] = index
      incident[i * 2 + 1] = neighbors[i]!
    }
    this.hlEdgeCount = incident.length

    const gl = this.gl
    const res = this.res
    if (!gl || !res) return
    gl.bindBuffer(gl.ARRAY_BUFFER, res.hlPosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, res.hlKindBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, kinds, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.hlEdgeBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, incident, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  }

  render(
    state: Uint8Array,
    camera: Camera = IDENTITY_CAMERA,
    style: NetworkRenderStyle = DEFAULT_NETWORK_RENDER_STYLE,
  ): void {
    const gl = this.gl
    const res = this.res
    if (!gl || !res || this.contextLost) return

    const dw = this.display.width
    const dh = this.display.height
    const view = viewTransform(dw, dh, camera)
    const nodeCount = this.layout.length / 2
    const pointSize = pointSizeFor(nodeCount, view.drawSize) * style.nodeScale

    gl.viewport(0, 0, dw, dh)
    gl.clearColor(0.02, 0.025, 0.035, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Edges first, under the nodes.
    if (res.edgeBuffer && this.edges.length > 0) {
      gl.useProgram(res.edgeProgram)
      setViewUniforms(gl, res.edgeProgram, view, dw, dh, style.layoutScale)
      gl.uniform4f(
        gl.getUniformLocation(res.edgeProgram, 'u_color'),
        style.edgeColor[0],
        style.edgeColor[1],
        style.edgeColor[2],
        style.edgeOpacity,
      )
      gl.lineWidth(style.edgeWidth)
      gl.bindVertexArray(res.edgeVao)
      gl.drawElements(gl.LINES, this.edges.length, gl.UNSIGNED_INT, 0)
    }

    // Upload this frame's state bytes and draw the point cloud.
    gl.useProgram(res.pointProgram)
    setViewUniforms(gl, res.pointProgram, view, dw, dh, style.layoutScale)
    gl.uniform1f(gl.getUniformLocation(res.pointProgram, 'u_pointSize'), pointSize)
    gl.uniform1i(gl.getUniformLocation(res.pointProgram, 'u_paletteSize'), this.paletteSize)
    gl.uniform3fv(gl.getUniformLocation(res.pointProgram, 'u_palette'), this.paletteFlat)

    gl.bindVertexArray(res.pointVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, res.stateBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, state, gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.POINTS, 0, Math.min(nodeCount, state.length))
    gl.bindVertexArray(null)

    // Selection overlay: bright incident edges + rings on the picked node and
    // its direct neighbors, drawn last so it sits above the cloud.
    if (this.selected !== null && this.hlKindCount > 0) {
      if (this.hlEdgeCount > 0) {
        gl.useProgram(res.edgeProgram)
        setViewUniforms(gl, res.edgeProgram, view, dw, dh, style.layoutScale)
        gl.uniform4f(gl.getUniformLocation(res.edgeProgram, 'u_color'), 1.0, 0.78, 0.2, 0.95)
        gl.lineWidth(Math.max(1.5, style.edgeWidth * 2))
        gl.bindVertexArray(res.hlEdgeVao)
        gl.drawElements(gl.LINES, this.hlEdgeCount, gl.UNSIGNED_INT, 0)
        gl.bindVertexArray(null)
      }
      gl.useProgram(res.hlProgram)
      setViewUniforms(gl, res.hlProgram, view, dw, dh, style.layoutScale)
      gl.uniform1f(gl.getUniformLocation(res.hlProgram, 'u_pointSize'), pointSize)
      gl.uniform3f(gl.getUniformLocation(res.hlProgram, 'u_selColor'), 1.0, 0.83, 0.2)
      gl.uniform3f(gl.getUniformLocation(res.hlProgram, 'u_neighborColor'), 0.36, 0.85, 0.98)
      gl.bindVertexArray(res.hlPointVao)
      gl.drawArrays(gl.POINTS, 0, this.hlKindCount)
      gl.bindVertexArray(null)
    }
  }

  /** Nearest node within ~12px of the pixel, else null (CPU spatial scan). */
  pickPoint(
    px: number,
    py: number,
    camera: Camera,
    style: NetworkRenderStyle = DEFAULT_NETWORK_RENDER_STYLE,
  ): number | null {
    const view = viewTransform(this.display.width, this.display.height, camera)
    let best = -1
    let bestDist = 12 * 12
    const count = this.layout.length / 2
    for (let i = 0; i < count; i++) {
      const lx = (this.layout[i * 2]! - 0.5) * style.layoutScale + 0.5
      const ly = (this.layout[i * 2 + 1]! - 0.5) * style.layoutScale + 0.5
      const sx = view.originX + lx * view.drawSize
      const sy = view.originY + ly * view.drawSize
      const dx = sx - px
      const dy = sy - py
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    return best >= 0 ? best : null
  }

  dispose(): void {
    this.display.removeEventListener('webglcontextlost', this.onContextLost)
    this.display.removeEventListener('webglcontextrestored', this.onContextRestored)
    const gl = this.gl
    const res = this.res
    if (gl && res) {
      gl.deleteBuffer(res.posBuffer)
      gl.deleteBuffer(res.stateBuffer)
      if (res.edgeBuffer) gl.deleteBuffer(res.edgeBuffer)
      gl.deleteBuffer(res.hlPosBuffer)
      gl.deleteBuffer(res.hlKindBuffer)
      gl.deleteBuffer(res.hlEdgeBuffer)
      gl.deleteVertexArray(res.pointVao)
      gl.deleteVertexArray(res.edgeVao)
      gl.deleteVertexArray(res.hlPointVao)
      gl.deleteVertexArray(res.hlEdgeVao)
      gl.deleteProgram(res.pointProgram)
      gl.deleteProgram(res.edgeProgram)
      gl.deleteProgram(res.hlProgram)
    }
    this.res = null
  }
}

/** Undirected adjacency from a flat [src,dst,src,dst,...] edge index buffer. */
function buildAdjacency(edges: Uint32Array, nodeCount: number): Map<number, number[]> {
  const adjacency = new Map<number, number[]>()
  const seen = new Map<number, Set<number>>()
  const add = (from: number, to: number) => {
    if (from === to) return
    let set = seen.get(from)
    if (!set) {
      set = new Set<number>()
      seen.set(from, set)
      adjacency.set(from, [])
    }
    if (set.has(to)) return
    set.add(to)
    adjacency.get(from)!.push(to)
  }
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const a = edges[i]!
    const b = edges[i + 1]!
    if (a >= nodeCount || b >= nodeCount) continue
    add(a, b)
    add(b, a)
  }
  return adjacency
}

interface ViewTransform {
  originX: number
  originY: number
  drawSize: number
}

function viewTransform(dw: number, dh: number, camera: Camera): ViewTransform {
  const fit = Math.min(dw, dh)
  const drawSize = fit * camera.scale
  return {
    originX: (dw - drawSize) / 2 + camera.x,
    originY: (dh - drawSize) / 2 + camera.y,
    drawSize,
  }
}

function setViewUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  view: ViewTransform,
  dw: number,
  dh: number,
  layoutScale: number,
): void {
  gl.uniform2f(gl.getUniformLocation(program, 'u_origin'), view.originX, view.originY)
  gl.uniform2f(gl.getUniformLocation(program, 'u_drawSize'), view.drawSize, view.drawSize)
  gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), dw, dh)
  gl.uniform1f(gl.getUniformLocation(program, 'u_layoutScale'), layoutScale)
}

function pointSizeFor(nodeCount: number, drawSize: number): number {
  if (nodeCount <= 0) return 4
  const byDensity = (drawSize / Math.sqrt(nodeCount)) * 0.6
  return Math.max(1.5, Math.min(14, byDensity))
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!vert || !frag) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[abm/gl] program link failed:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[abm/gl] shader compile failed:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}
