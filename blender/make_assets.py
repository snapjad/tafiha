"""
طفّيها — 3D asset builder.

Builds the cigarette and a disposable vape procedurally and renders them.

  lit   straight lit cigarette as layers for the dashboard: cig-body + cig-tip-{out,idle,hot}
  icon  app icons (straight lit cigarette on red)
  vape  hero-vape.webp
  cig   the older crushed 3/4 cigarette (no longer used by the app)

Run:
  blender.exe -b --factory-startup -P make_assets.py -- <out_dir> [test|final] [lit,icon|vape|cig]
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, noise

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
OUT = os.path.abspath(args[0]) if args else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "assets"))
MODE = args[1] if len(args) > 1 else "final"
ONLY = args[2].split(",") if len(args) > 2 else ["cig", "vape", "icon"]
os.makedirs(OUT, exist_ok=True)

BRAND_RED = "#E1261C"


# ---------------------------------------------------------------- helpers
def hex_rgb(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def lin(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (lin(c[0]), lin(c[1]), lin(c[2]), a)


def sock(coll, ident, name=None):
    for s in coll:
        if s.identifier == ident:
            return s
    for s in coll:
        if s.name == (name or ident) and getattr(s, "enabled", True):
            return s
    raise KeyError(ident)


def setin(node, name, val):
    if name in node.inputs:
        node.inputs[name].default_value = val


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, b


def obj_coords(nt):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    return tc.outputs["Object"]


def noise_tex(nt, vec, scale, detail=4.0, rough=0.5):
    n = nt.nodes.new("ShaderNodeTexNoise")
    setin(n, "Scale", scale)
    setin(n, "Detail", detail)
    setin(n, "Roughness", rough)
    nt.links.new(vec, n.inputs["Vector"])
    return n


def ramp(nt, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], stops[0][1]
    els[1].position, els[1].color = stops[-1][0], stops[-1][1]
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = col
    return r


def math_node(nt, op, a=None, b=None):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[0]


def mix_color(nt, fac, a, b):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    nt.links.new(fac, sock(m.inputs, "Factor_Float", "Factor"))
    for ident, v in (("A_Color", a), ("B_Color", b)):
        s = sock(m.inputs, ident)
        if isinstance(v, tuple):
            s.default_value = v
        else:
            nt.links.new(v, s)
    return sock(m.outputs, "Result_Color", "Result")


def bump(nt, height, strength, distance=0.1):
    bn = nt.nodes.new("ShaderNodeBump")
    setin(bn, "Strength", strength)
    setin(bn, "Distance", distance)
    nt.links.new(height, bn.inputs["Height"])
    return bn.outputs["Normal"]


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def orbit(obj, target, dist, az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    obj.location = (
        target[0] + dist * math.cos(el) * math.sin(az),
        target[1] - dist * math.cos(el) * math.cos(az),
        target[2] + dist * math.sin(el),
    )
    look_at(obj, target)


# ---------------------------------------------------------------- materials
def mat_paper(burn_x=None):
    """Cigarette paper. Charring comes from the `along` attribute, or, when
    burn_x is given, from object X so it scorches to black at that line."""
    m, nt, b = new_mat("Paper" if burn_x is None else "PaperTip")
    L = nt.links
    co = obj_coords(nt)

    if burn_x is None:
        attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "along"
        src = attr.outputs["Fac"]
    else:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        L.new(co, sep.inputs[0])
        k = math_node(nt, "SUBTRACT", sep.outputs["X"], burn_x - 0.2)
        src = math_node(nt, "ADD", math_node(nt, "MULTIPLY", k, 0.044 / 0.2), 0.918)
    jag = noise_tex(nt, co, 9.0, 6.0, 0.6)
    j = math_node(nt, "SUBTRACT", jag.outputs["Fac"], 0.5)
    j = math_node(nt, "MULTIPLY", j, 0.03)
    along = math_node(nt, "ADD", src, j)

    col = ramp(nt, [
        (0.0, hex_rgb("#F7F6F3")),
        (0.918, hex_rgb("#F7F6F3")),
        (0.936, hex_rgb("#D9BE95")),
        (0.950, hex_rgb("#6B4428")),
        (0.962, hex_rgb("#231C19")),
        (1.0, hex_rgb("#151211")),
    ])
    L.new(along, col.inputs["Fac"])
    L.new(col.outputs["Color"], b.inputs["Base Color"])

    rough = ramp(nt, [(0.0, (0.55,) * 3 + (1,)), (0.93, (0.55,) * 3 + (1,)),
                      (0.96, (0.92,) * 3 + (1,)), (1.0, (0.95,) * 3 + (1,))])
    L.new(along, rough.inputs["Fac"])
    L.new(rough.outputs["Color"], b.inputs["Roughness"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    setin(wave, "Scale", 22.0)
    setin(wave, "Distortion", 0.6)
    L.new(co, wave.inputs["Vector"])
    fine = noise_tex(nt, co, 60.0, 8.0, 0.7)
    h = math_node(nt, "ADD", math_node(nt, "MULTIPLY", wave.outputs["Fac"], 0.35),
                  fine.outputs["Fac"])
    L.new(bump(nt, h, 0.06, 0.02), b.inputs["Normal"])
    setin(b, "Subsurface Weight", 0.08)
    setin(b, "Subsurface Radius", (0.3, 0.3, 0.3))
    setin(b, "Subsurface Scale", 0.05)
    setin(b, "Sheen Weight", 0.25)
    return m


def mat_cork():
    m, nt, b = new_mat("Cork")
    L = nt.links
    co = obj_coords(nt)
    base = noise_tex(nt, co, 7.0, 8.0, 0.62)
    col = ramp(nt, [(0.30, hex_rgb("#C8822F")), (0.55, hex_rgb("#E3A248")),
                    (0.75, hex_rgb("#F0BD6A"))])
    L.new(base.outputs["Fac"], col.inputs["Fac"])
    spk = noise_tex(nt, co, 55.0, 2.0, 0.5)
    spk_mask = ramp(nt, [(0.60, (0, 0, 0, 1)), (0.66, (1, 1, 1, 1))])
    L.new(spk.outputs["Fac"], spk_mask.inputs["Fac"])
    fac = math_node(nt, "MULTIPLY", spk_mask.outputs["Color"], 0.85)
    L.new(mix_color(nt, fac, col.outputs["Color"], hex_rgb("#8E4E19")),
          b.inputs["Base Color"])
    setin(b, "Roughness", 0.5)
    setin(b, "Sheen Weight", 0.2)
    h = math_node(nt, "ADD", base.outputs["Fac"],
                  math_node(nt, "MULTIPLY", spk_mask.outputs["Color"], -0.4))
    L.new(bump(nt, h, 0.12, 0.03), b.inputs["Normal"])
    return m


def mat_flat(name, color, rough=0.5, coat=0.0, metallic=0.0):
    m, nt, b = new_mat(name)
    setin(b, "Base Color", hex_rgb(color))
    setin(b, "Roughness", rough)
    setin(b, "Metallic", metallic)
    if coat:
        setin(b, "Coat Weight", coat)
        setin(b, "Coat Roughness", 0.08)
    return m


def mat_filter_end():
    m, nt, b = new_mat("FilterEnd")
    co = obj_coords(nt)
    n = noise_tex(nt, co, 90.0, 10.0, 0.75)
    col = ramp(nt, [(0.3, hex_rgb("#E7DFD0")), (0.7, hex_rgb("#F6F2EA"))])
    nt.links.new(n.outputs["Fac"], col.inputs["Fac"])
    nt.links.new(col.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(bump(nt, n.outputs["Fac"], 0.5, 0.02), b.inputs["Normal"])
    setin(b, "Roughness", 0.95)
    return m


def mat_ash():
    m, nt, b = new_mat("Ash")
    co = obj_coords(nt)
    n = noise_tex(nt, co, 26.0, 10.0, 0.7)
    col = ramp(nt, [(0.35, hex_rgb("#161211")), (0.55, hex_rgb("#3A3431")),
                    (0.72, hex_rgb("#8C8682")), (0.85, hex_rgb("#C9C4BF"))])
    nt.links.new(n.outputs["Fac"], col.inputs["Fac"])
    nt.links.new(col.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(bump(nt, n.outputs["Fac"], 0.9, 0.08), b.inputs["Normal"])
    setin(b, "Roughness", 0.97)
    return m


def mat_vape_body():
    m, nt, b = new_mat("VapeBody")
    L = nt.links
    co = obj_coords(nt)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    L.new(co, sep.inputs[0])
    grad = math_node(nt, "MULTIPLY", math_node(nt, "ADD", sep.outputs["Z"], 3.8), 1 / 7.6)
    col = ramp(nt, [(0.0, hex_rgb("#1D1F24")), (0.6, hex_rgb("#34373E")),
                    (1.0, hex_rgb("#4A4D55"))])
    L.new(grad, col.inputs["Fac"])
    L.new(col.outputs["Color"], b.inputs["Base Color"])
    setin(b, "Metallic", 0.55)
    setin(b, "Roughness", 0.32)
    setin(b, "Coat Weight", 1.0)
    setin(b, "Coat Roughness", 0.06)
    fine = noise_tex(nt, co, 180.0, 4.0, 0.5)
    L.new(bump(nt, fine.outputs["Fac"], 0.04, 0.01), b.inputs["Normal"])
    return m


# ---------------------------------------------------------------- cigarette
R = 0.4
X0, X1 = -4.2, 4.2
FILTER_END = -1.45
BAND = (-1.76, -1.69)
B0, B1, THETA = 1.15, 2.05, math.radians(38)
RB = (B1 - B0) / THETA


def crumple(x, y, z):
    t = (x - (B0 - 0.3)) / ((B1 + 0.3) - (B0 - 0.3))
    if 0.0 < t < 1.0:
        w = math.sin(math.pi * t) ** 2
        a = math.atan2(z, y)
        n1 = noise.noise(Vector((x * 4.5, math.cos(a) * 1.7, math.sin(a) * 1.7)))
        n2 = noise.noise(Vector((x * 13.0 + 3.1, math.cos(a) * 4.2, math.sin(a) * 4.2)))
        s = 1.0 - w * (0.10 + 0.09 * n1 + 0.035 * n2)
        y *= s
        z *= s * (1.0 - 0.24 * w)
    return x, y, z


def bend(x, y, z):
    if x <= B0:
        return x, y, z
    phi = (min(x, B1) - B0) / RB
    cx, cz = B0 + RB * math.sin(phi), RB * (1.0 - math.cos(phi))
    tx, tz = math.cos(phi), math.sin(phi)
    nx, nz = -math.sin(phi), math.cos(phi)
    extra = max(0.0, x - B1)
    return cx + extra * tx + z * nx, y, cz + extra * tz + z * nz


def deform(x, y, z):
    return bend(*crumple(x, y, z))


def build_cigarette():
    mats = [mat_cork(), mat_flat("Band", BRAND_RED, 0.38), mat_paper(),
            mat_filter_end(), mat_ash()]
    SEG, step = 72, 0.03
    xs = []
    x = X0
    while x < X1 - 1e-6:
        xs.append(x)
        x += step
    xs.append(X1)

    bm = bmesh.new()
    along = bm.verts.layers.float.new("along")
    last = len(xs) - 1

    def tip_recede(i, a):
        # jagged, burnt edge on the last few rings
        k = i - (last - 5)
        if k < 0:
            return 0.0, 1.0
        f = k / 5.0
        n = noise.noise(Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, 5.3)))
        return -f * (0.07 + 0.07 * (0.5 + 0.5 * n)), 1.0 - 0.07 * f

    rings = []
    for i, x in enumerate(xs):
        ring = []
        for j in range(SEG):
            a = 2 * math.pi * j / SEG
            dx, rs = tip_recede(i, a)
            px, py, pz = deform(x + dx, R * rs * math.cos(a), R * rs * math.sin(a))
            v = bm.verts.new((px, py, pz))
            v[along] = (x - X0) / (X1 - X0)
            ring.append(v)
        rings.append(ring)

    def mat_for(xm):
        if BAND[0] <= xm < BAND[1]:
            return 1
        return 0 if xm < FILTER_END else 2

    for i in range(len(rings) - 1):
        mi = mat_for((xs[i] + xs[i + 1]) / 2)
        for j in range(SEG):
            f = bm.faces.new((rings[i][j], rings[i][(j + 1) % SEG],
                              rings[i + 1][(j + 1) % SEG], rings[i + 1][j]))
            f.material_index = mi
            f.smooth = True

    def cap(ring_coords, center, inner_scale, inner_shift, mi, jitter=0.0):
        outer = [bm.verts.new(c) for c in ring_coords]
        cx = Vector(center)
        inner = []
        for j, c in enumerate(ring_coords):
            p = cx.lerp(Vector(c), inner_scale)
            p += Vector(inner_shift)
            if jitter:
                p += Vector((jitter * noise.noise(p * 7.0), 0, 0))
            inner.append(bm.verts.new(p))
        mid = bm.verts.new(cx + Vector(inner_shift) * 1.3)
        for v in outer + inner + [mid]:
            v[along] = 1.0 if mi == 4 else 0.0
        n = len(outer)
        for j in range(n):
            f = bm.faces.new((outer[j], outer[(j + 1) % n], inner[(j + 1) % n], inner[j]))
            f.material_index = mi
            f.smooth = mi == 4
            f2 = bm.faces.new((inner[j], inner[(j + 1) % n], mid))
            f2.material_index = mi
            f2.smooth = mi == 4

    cap([tuple(v.co) for v in rings[0]], deform(X0, 0, 0), 0.9, (0.012, 0, 0), 3)
    # tip: recessed charred ash, pointing along the bent direction
    tip_c = Vector(deform(X1 - 0.08, 0, 0))
    tdir = (Vector(deform(X1, 0, 0)) - Vector(deform(X1 - 0.2, 0, 0))).normalized()
    cap([tuple(v.co) for v in rings[-1]], tuple(tip_c), 0.86,
        tuple(-tdir * 0.05), 4, jitter=0.03)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Cigarette")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Cigarette", me)
    for m in mats:
        me.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- vape
def rounded_box(name, size, bevel, segs=10):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    md = ob.modifiers.new("Bevel", "BEVEL")
    md.width = bevel
    md.segments = segs
    md.limit_method = "NONE"
    md.harden_normals = False
    bpy.ops.object.shade_smooth()
    return ob


def build_vape():
    body = rounded_box("VapeBody", (1.3, 2.2, 7.6), 0.5, 12)
    body.data.materials.append(mat_vape_body())

    tip = rounded_box("VapeTip", (0.78, 1.55, 1.5), 0.3, 10)
    tip.location = (0, 0, 7.6 / 2 + 0.55)
    tp = tip.modifiers.new("Taper", "SIMPLE_DEFORM")
    tp.deform_method = "TAPER"
    tp.factor = -0.5
    tp.deform_axis = "Z"
    tip.modifiers.move(1, 0)
    tip.data.materials.append(mat_flat("VapeTip", "#0E0F11", 0.18, coat=1.0))

    led = rounded_box("VapeLed", (0.08, 0.9, 0.08), 0.03, 4)
    led.location = (1.3 / 2 + 0.005, 0, -7.6 / 2 + 1.0)
    led.data.materials.append(mat_flat("Led", BRAND_RED, 0.3, coat=0.6))

    parts = [body, tip, led]
    root = bpy.data.objects.new("Vape", None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root, parts


# ---------------------------------------------------------------- scene
def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24 if MODE == "test" else 160
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.render.film_transparent = True
    for vt in ("Khronos PBR Neutral", "Standard"):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            continue
    sc.view_settings.exposure = 0.0

    world = bpy.data.worlds.new("World")
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.get("World Output") or nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    bg.inputs["Color"].default_value = hex_rgb("#FFFFFF")
    bg.inputs["Strength"].default_value = 0.45

    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def add_light(name, loc, target, power, size, color="#FFFFFF", size_y=None):
    ld = bpy.data.lights.new(name, type="AREA")
    ld.energy = power
    ld.color = hex_rgb(color)[:3]
    if size_y:
        ld.shape = "RECTANGLE"
        ld.size = size
        ld.size_y = size_y
    else:
        ld.size = size
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def studio(target):
    add_light("Key", (-7, -8, 11), target, 950, 7)
    add_light("Fill", (9, -6, 4), target, 380, 6)
    add_light("Rim", (3, 10, 4.5), target, 900, 3, color="#FF3B2A", size_y=9)
    add_light("Top", (0, 0, 14), target, 250, 10)


def render(sc, path, w, h):
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 50 if MODE == "test" else 100
    ext = os.path.splitext(path)[1].lower()
    ims = sc.render.image_settings
    ims.file_format = "WEBP" if ext == ".webp" else "PNG"
    ims.color_mode = "RGBA"
    if ext == ".webp":
        ims.quality = 88
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def composite_icon(src, sizes, bg_hex):
    img = bpy.data.images.load(src)
    w, h = img.size
    px = list(img.pixels)
    r, g, b = [int(bg_hex.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    out = [0.0] * len(px)
    for i in range(0, len(px), 4):
        a = px[i + 3]
        out[i] = px[i] * a + r * (1 - a)
        out[i + 1] = px[i + 1] * a + g * (1 - a)
        out[i + 2] = px[i + 2] * a + b * (1 - a)
        out[i + 3] = 1.0
    for name, s in sizes:
        im = bpy.data.images.new(name, w, h, alpha=False)
        im.pixels = out
        if s != w:
            im.scale(s, s)
        im.filepath_raw = os.path.join(OUT, name)
        im.file_format = "PNG"
        im.save()
        print("ICON", im.filepath_raw)


# ---------------------------------------------------------------- lit, straight cigarette (layered)
# The dashboard animates the burn by clipping the body and sliding the tip.
# Both layers share one orthographic camera, so world X maps linearly to image X:
#   u = (x - LIT_CX) / LIT_ORTHO + 0.5
LIT_CX, LIT_ORTHO = 0.175, 10.0
LIT_B = 4.2          # burn line when the cigarette is new
TIP_LEN = 0.34       # glowing cone beyond the burn line
LIT_W, LIT_H = 1600, 400


def tube_rings(bm, xs, radius_at, seg, along_at=None, jitter_at=None):
    layer = bm.verts.layers.float.get("along") or bm.verts.layers.float.new("along")
    rings = []
    for x in xs:
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            dx = jitter_at(x, a) if jitter_at else 0.0
            r = radius_at(x, a)
            v = bm.verts.new((x + dx, r * math.cos(a), r * math.sin(a)))
            if along_at:
                v[layer] = along_at(x)
            ring.append(v)
        rings.append(ring)
    return rings


def stitch(bm, rings, seg, mat_at, xs):
    for i in range(len(rings) - 1):
        mi = mat_at((xs[i] + xs[i + 1]) / 2)
        for j in range(seg):
            f = bm.faces.new((rings[i][j], rings[i][(j + 1) % seg],
                              rings[i + 1][(j + 1) % seg], rings[i + 1][j]))
            f.material_index = mi
            f.smooth = True


def frange(a, b, step):
    xs, x = [], a
    while x < b - 1e-6:
        xs.append(x)
        x += step
    xs.append(b)
    return xs


def finish_mesh(bm, name, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in mats:
        me.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_straight_body(paper, end=LIT_B + 0.05):
    SEG = 72
    xs = frange(X0, end, 0.03)
    bm = bmesh.new()
    rings = tube_rings(bm, xs, lambda x, a: R, SEG)

    def mat_at(xm):
        if BAND[0] <= xm < BAND[1]:
            return 1
        return 0 if xm < FILTER_END else 2

    stitch(bm, rings, SEG, mat_at, xs)
    # filter face
    c = bm.verts.new((X0 - 0.004, 0, 0))
    outer = [bm.verts.new(v.co) for v in rings[0]]
    for j in range(SEG):
        f = bm.faces.new((outer[(j + 1) % SEG], outer[j], c))
        f.material_index = 3
    return finish_mesh(bm, "Body", [mat_cork(), mat_flat("Band", BRAND_RED, 0.38), paper, mat_filter_end()])


def mat_ember():
    m, nt, b = new_mat("Ember")
    L = nt.links
    co = obj_coords(nt)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    L.new(co, sep.inputs[0])
    s = math_node(nt, "DIVIDE", math_node(nt, "SUBTRACT", sep.outputs["X"], LIT_B - 0.03), TIP_LEN)
    s = math_node(nt, "MINIMUM", math_node(nt, "MAXIMUM", s, 0.0), 1.0)

    # ash: charred near the burning ring, pale flaky grey towards the tip
    n_ash = noise_tex(nt, co, 30.0, 12.0, 0.74)
    ash_v = math_node(nt, "ADD", math_node(nt, "MULTIPLY", s, 0.85),
                      math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", n_ash.outputs["Fac"], 0.5), 0.7))
    ash = ramp(nt, [(0.05, hex_rgb("#171210")), (0.35, hex_rgb("#3b3533")),
                    (0.65, hex_rgb("#8d8783")), (0.9, hex_rgb("#cfcac5"))])
    L.new(ash_v, ash.inputs["Fac"])

    # glow: a ring where the tobacco meets the paper, thin cracks just behind it
    ring = math_node(nt, "MAXIMUM", math_node(nt, "SUBTRACT", 1.0, math_node(nt, "DIVIDE", s, 0.3)), 0.0)
    n_glow = noise_tex(nt, co, 14.0, 6.0, 0.6)
    patch = ramp(nt, [(0.3, (0.35, 0.35, 0.35, 1)), (0.65, (1, 1, 1, 1))])
    L.new(n_glow.outputs["Fac"], patch.inputs["Fac"])
    warp = noise_tex(nt, co, 6.0, 2.0, 0.5)
    wv = nt.nodes.new("ShaderNodeVectorMath")
    wv.operation = "ADD"
    L.new(co, wv.inputs[0])
    wsc = nt.nodes.new("ShaderNodeVectorMath")
    wsc.operation = "SCALE"
    L.new(warp.outputs["Color"], wsc.inputs[0])
    wsc.inputs["Scale"].default_value = 0.06
    L.new(wsc.outputs[0], wv.inputs[1])
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    try:
        vor.feature = "DISTANCE_TO_EDGE"
    except Exception:
        pass
    setin(vor, "Scale", 36.0)
    L.new(wv.outputs[0], vor.inputs["Vector"])
    crack = ramp(nt, [(0.0, (1, 1, 1, 1)), (0.045, (0, 0, 0, 1))])
    L.new(vor.outputs["Distance"], crack.inputs["Fac"])
    near = math_node(nt, "MAXIMUM", math_node(nt, "SUBTRACT", 1.0, math_node(nt, "DIVIDE", s, 0.6)), 0.0)
    crack_w = math_node(nt, "MULTIPLY", crack.outputs["Color"], math_node(nt, "MULTIPLY", near, 0.7))
    mask = math_node(nt, "ADD", math_node(nt, "MULTIPLY", ring, patch.outputs["Color"]), crack_w)
    # on a drag the whole cone lights up
    cov = math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", s, 0.65)), 0.0)
    coverage = cov.node.inputs[1]
    mask = math_node(nt, "ADD", mask, math_node(nt, "MULTIPLY", cov, patch.outputs["Color"]))
    mask = math_node(nt, "MINIMUM", mask, 1.0)

    L.new(mix_color(nt, mask, ash.outputs["Color"], hex_rgb("#120d0b")), b.inputs["Base Color"])
    ecol = ramp(nt, [(0.0, hex_rgb("#a02200")), (0.4, hex_rgb("#ff4d00")), (0.75, hex_rgb("#ff8a00")),
                     (1.0, hex_rgb("#ffc04d"))])
    L.new(mask, ecol.inputs["Fac"])
    L.new(ecol.outputs["Color"], b.inputs["Emission Color"])
    strength = math_node(nt, "MULTIPLY", mask, 1.0)
    L.new(strength, b.inputs["Emission Strength"])
    L.new(bump(nt, n_ash.outputs["Fac"], 0.7, 0.04), b.inputs["Normal"])
    setin(b, "Roughness", 0.96)
    level = strength.node.inputs[1]
    return m, (level, coverage)


def build_tip(_paper):
    paper = mat_paper(burn_x=LIT_B)
    SEG = 72
    bm = bmesh.new()
    # paper section: seamless with the body, scorching to black at the burn line
    xs = frange(LIT_B - 0.7, LIT_B, 0.025)

    def along_at(x):
        k = x - (LIT_B - 0.22)
        return 0.918 + k / 0.22 * 0.044 if k >= 0 else 0.918 + k * 0.5

    def edge_jit(x, a):
        if x < LIT_B - 1e-6:
            return 0.0
        return -0.02 * (0.5 + 0.5 * noise.noise(Vector((math.cos(a) * 2.4, math.sin(a) * 2.4, 1.7))))

    rings = tube_rings(bm, xs, lambda x, a: R if x < LIT_B - 0.02 else R * 0.99, SEG, along_at, edge_jit)
    stitch(bm, rings, SEG, lambda xm: 0, xs)

    # glowing cone of burning tobacco covered in ash
    R0 = R * 0.95
    n = 26

    def cone_r(u, a, x):
        if u < 0.62:
            r = R0 * (1 - 0.22 * u)
        else:
            k = (u - 0.62) / 0.38
            r = R0 * (1 - 0.22 * 0.62) * math.sqrt(max(0.0, 1 - k * k))
        rough = 0.022 * noise.noise(Vector((x * 9, math.cos(a) * 3, math.sin(a) * 3)))
        return max(0.0, r + rough * (1 - u * 0.5))

    cone = []
    for i in range(n + 1):
        u = i / n
        x = LIT_B - 0.03 + TIP_LEN * u
        ring = []
        for j in range(SEG):
            a = 2 * math.pi * j / SEG
            r = cone_r(u, a, x)
            ring.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))))
        cone.append(ring)
    for i in range(n):
        for j in range(SEG):
            f = bm.faces.new((cone[i][j], cone[i][(j + 1) % SEG], cone[i + 1][(j + 1) % SEG], cone[i + 1][j]))
            f.material_index = 1
            f.smooth = True
    ember, level = mat_ember()
    return finish_mesh(bm, "Tip", [paper, ember]), level


def sun(name, frm, strength, color="#FFFFFF", angle=10):
    ld = bpy.data.lights.new(name, type="SUN")
    ld.energy = strength
    ld.angle = math.radians(angle)
    ld.color = hex_rgb(color)[:3]
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = frm
    look_at(ob, (0, 0, 0))
    return ob


def lit_main():
    sc, cam = setup_scene()
    sc.view_settings.view_transform = "Standard"
    if MODE == "test":
        sc.cycles.samples = 64
        sc.cycles.use_denoising = os.environ.get("NODENOISE") != "1"
    paper = mat_paper()
    body = build_straight_body(paper)
    tip, level = build_tip(paper)
    sun("Key", (-4, -6, 8), 3.4)
    sun("Fill", (6, -5, 1.5), 1.1)
    sun("Rim", (0, 8, 3), 2.2, color="#FFD9CC")

    cam.data.type = "ORTHO"
    cam.data.ortho_scale = LIT_ORTHO
    el = math.radians(14)
    cam.location = (LIT_CX, -30 * math.cos(el), 30 * math.sin(el))
    look_at(cam, (LIT_CX, 0, 0))

    GLOW = {"out": (0.0, 0.0), "idle": (2.2, 0.0), "hot": (4.5, 0.9)}

    def glow(k):
        level[0].default_value, level[1].default_value = GLOW[k]
    ext = ".png" if MODE == "test" else ".webp"
    if "lit" in ONLY:
        tip.hide_render = True
        render(sc, os.path.join(OUT, "cig-body" + ext), LIT_W, LIT_H)
        tip.hide_render = False
        body.hide_render = True
        for k in GLOW:
            glow(k)
            render(sc, os.path.join(OUT, f"cig-tip-{k}" + ext), LIT_W, LIT_H)
        body.hide_render = False


    if "icon" in ONLY:
        # a body that stops under the tip, so the two never overlap in one render
        body.hide_render = True
        body = build_straight_body(paper, end=LIT_B - 0.3)
        rig = bpy.data.objects.new("Rig", None)
        sc.collection.objects.link(rig)
        body.parent = rig
        tip.parent = rig
        rig.location = (-LIT_CX, 0, 0)
        rig.rotation_euler = (0, math.radians(-32), 0)
        glow("idle")
        cam.data.ortho_scale = 10.6
        cam.location = (0, -30, 0)
        look_at(cam, (0, 0, 0))
        tmp = os.path.join(OUT, "_icon_src.png")
        render(sc, tmp, 1024, 1024)
        composite_icon(tmp, [("icon-512.png", 512), ("icon-192.png", 192),
                             ("apple-touch-icon.png", 180)], BRAND_RED)
        try:
            os.remove(tmp)
        except OSError:
            pass
    print("DONE")


if "lit" in ONLY or "icon" in ONLY:
    lit_main()
    raise SystemExit(0)

# ---------------------------------------------------------------- main (3/4 views)
sc, cam = setup_scene()
cig = build_cigarette()
cig.rotation_euler = (0, 0, math.radians(-14))
target = (0.9, 0.0, 0.55)
studio(target)

if "cig" in ONLY:
    cam.data.lens = 85
    orbit(cam, (0.05, 0.0, 0.75), 21, 8, 24)
    render(sc, os.path.join(OUT, "hero-cig.webp"), 1600, 800)
    if MODE == "test":
        render(sc, os.path.join(OUT, "hero-cig.png"), 1600, 800)

if "vape" in ONLY:
    cig.hide_render = True
    root, parts = build_vape()
    root.rotation_euler = (math.radians(90), math.radians(8), math.radians(-72))
    root.location = (0.4, 0, 0.3)
    orbit(cam, (-0.3, 0, 0.3), 25, 8, 26)
    render(sc, os.path.join(OUT, "hero-vape.webp"), 1600, 800)
    if MODE == "test":
        render(sc, os.path.join(OUT, "hero-vape.png"), 1600, 800)
    for p in parts:
        p.hide_render = True
    cig.hide_render = False

if "icon" in ONLY:
    cig.rotation_euler = (0, math.radians(-18), 0)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 10.2
    cam.location = (0.6, -30, 0.6)
    look_at(cam, (0.6, 0, 0.6))
    sc.render.film_transparent = True
    tmp = os.path.join(OUT, "_icon_src.png")
    render(sc, tmp, 1024, 1024)
    composite_icon(tmp, [("icon-512.png", 512), ("icon-192.png", 192),
                         ("apple-touch-icon.png", 180)], BRAND_RED)
    try:
        os.remove(tmp)
    except OSError:
        pass

print("DONE")
