"""
طفّيها — 3D icons for the dashboard (transparent, square), to the brand book (section 11):

  light     key from the top right at 45° (4500K), a soft fill from the left at half strength,
            no rim light, no glowing edges
  material  matte, like clay or soft plastic (roughness 0.55), no chrome, no glass
  camera    50mm, 30° from above, turned 25°, the same for every icon
  colours   from the palette only (ember red, filter yellow, white, ink), at most two per icon
  shadow    a soft contact shadow under the icon only, 20% opacity, no long shadow, no reflection
  size      512×512, the icon fills 70% of the square

  coins   money saved            pack    cigarettes not bought
  drop    cravings put out       heart   health
  shield  guardian               gum     nicotine gum
  patch   nicotine patch         target  savings goal

Run:
  blender.exe -b --factory-startup -P make_icons.py -- <out_dir> [test|final] [names,...]
"""
import bpy
import math
import os
import sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
OUT = os.path.abspath(args[0]) if args else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "icons"))
MODE = args[1] if len(args) > 1 else "final"
ALL = ["coins", "pack", "drop", "heart", "shield", "gum", "patch", "target"]
ONLY = args[2].split(",") if len(args) > 2 else ALL
os.makedirs(OUT, exist_ok=True)

SIZE = 512
FILL = 0.70            # share of the square the icon takes
LENS = 50
CAM_EL, CAM_AZ = 30, 25
SHADOW = 0.20          # contact shadow opacity

RED, YELLOW, WHITE, INK = "#E1261C", "#E5A548", "#F7F5F1", "#1B1716"
ROUGH = 0.55


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def mat(name, color):
    """Matte clay: palette colour, roughness 0.55, nothing metallic or glossy."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = ROUGH
    b.inputs["Metallic"].default_value = 0.0
    for key in ("Specular IOR Level", "Specular"):
        if key in b.inputs:
            b.inputs[key].default_value = 0.3
            break
    return m


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24 if MODE == "test" else 160
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    for vt in ("Khronos PBR Neutral", "Standard"):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            continue
    w = bpy.data.worlds.new("W")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = 0.45
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = LENS
    cam.data.clip_end = 500
    return sc, cam


def mesh_points(objs):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    return pts


def add_light(sc, name, power, size, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = power
    ld.size = size
    ld.color = lin(color)[:3]
    ob = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(ob)
    return ob, ld


def contact_shadow(sc, center, rx, ry):
    """A soft dark ellipse on the ground, seen only by the camera, at most 20% opaque."""
    bpy.ops.mesh.primitive_plane_add(size=2, location=(center.x, center.y, 0.0005))
    pl = bpy.context.active_object
    pl.name = "ContactShadow"
    pl.scale = (rx, ry, 1)
    for attr in ("visible_shadow", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter"):
        if hasattr(pl, attr):
            setattr(pl, attr, False)
    m = bpy.data.materials.new("Shadow")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "QUADRATIC_SPHERE"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (SHADOW, SHADOW, SHADOW, 1)
    mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0, 0, 0, 1)
    em.inputs["Strength"].default_value = 0.0
    nt.links.new(tc.outputs["Object"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    try:
        m.blend_method = "BLEND"
    except Exception:
        pass
    pl.data.materials.append(m)
    return pl


def shoot(sc, cam, name):
    """Same camera, lights, ground and framing for every icon."""
    objs = [o for o in sc.objects if o.type in ("MESH", "CURVE")]
    pts = mesh_points(objs)
    zmin = min(p.z for p in pts)
    roots = set()
    for o in objs:
        while o.parent:
            o = o.parent
        roots.add(o)
    for o in roots:
        o.location.z -= zmin                       # rest on the ground
    pts = [p - Vector((0, 0, zmin)) for p in pts]
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    height = max(zs)
    base = [p for p in pts if p.z < 0.12 * height + 0.02] or pts
    bx, by = [p.x for p in base], [p.y for p in base]
    foot = Vector(((min(bx) + max(bx)) / 2, (min(by) + max(by)) / 2, 0))
    rx = max(0.45, (max(bx) - min(bx)) / 2 * 1.15)
    ry = max(0.32, (max(by) - min(by)) / 2 * 1.15, rx * 0.42)
    contact_shadow(sc, foot, rx, ry)

    # camera: 30° down, turned 25°, distance and aim fitted so the icon fills 70%
    a, e = math.radians(CAM_AZ), math.radians(CAM_EL)
    back = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
    target = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, height / 2))
    dist = 3.0 * max(max(xs) - min(xs), max(ys) - min(ys), height)
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    for _ in range(12):
        cam.location = target + back * dist
        look_at(cam, target)
        bpy.context.view_layer.update()
        uv = [world_to_camera_view(sc, cam, p) for p in pts]
        us, vs = [q.x for q in uv], [q.y for q in uv]
        ext = max(max(us) - min(us), max(vs) - min(vs))
        cu, cv = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
        frame = 2 * dist * math.tan(math.atan(18 / LENS))      # 36mm sensor, square frame
        right = cam.matrix_world.to_quaternion() @ Vector((1, 0, 0))
        up = cam.matrix_world.to_quaternion() @ Vector((0, 1, 0))
        target += right * (cu - 0.5) * frame + up * (cv - 0.5) * frame
        dist *= ext / FILL
        if abs(ext - FILL) < 0.004 and abs(cu - 0.5) < 0.004 and abs(cv - 0.5) < 0.004:
            break
    cam.location = target + back * dist
    look_at(cam, target)

    # key: top right at 45°, warm 4500K; fill: from the left, half as strong, neutral
    right = Vector((math.cos(a), math.sin(a), 0))
    k_dir = (right * math.cos(math.radians(45)) + back * 0.55 + Vector((0, 0, 1)) * math.sin(math.radians(45))).normalized()
    f_dir = (-right * 0.9 + back * 0.45 + Vector((0, 0, 0.35))).normalized()
    reach = dist * 1.1
    key, _ = add_light(sc, "Key", 26 * reach * reach, reach * 0.6, "#FFDBBA")
    key.location = target + k_dir * reach
    look_at(key, target)
    fill, _ = add_light(sc, "Fill", 13 * reach * reach, reach * 0.9, "#FFFFFF")
    fill.location = target + f_dir * reach
    look_at(fill, target)

    ims = sc.render.image_settings
    ims.file_format = "PNG" if MODE == "test" else "WEBP"
    ims.color_mode = "RGBA"
    if MODE != "test":
        ims.quality = 90
    sc.render.filepath = os.path.join(OUT, name + (".png" if MODE == "test" else ".webp"))
    bpy.ops.render.render(write_still=True)
    print("RENDERED", sc.render.filepath)


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def cyl(r, depth, loc, m, verts=96, bevel=0.03):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    ob = bpy.context.active_object
    md = ob.modifiers.new("B", "BEVEL")
    md.width = bevel
    md.segments = 4
    md.limit_method = "ANGLE"
    smooth(ob)
    ob.data.materials.append(m)
    return ob


def box(size, loc, m, bevel=0.06, segs=6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    md = ob.modifiers.new("B", "BEVEL")
    md.width = bevel
    md.segments = segs
    md.limit_method = "NONE"
    smooth(ob)
    ob.data.materials.append(m)
    return ob


def outline(name, pts, extrude, bevel, m, bezier=False):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.bevel_resolution = 8
    cu.resolution_u = 24
    if bezier:
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(len(pts) - 1)
        for bp, (x, y) in zip(sp.bezier_points, pts):
            bp.co = (x, y, 0)
            bp.handle_left_type = bp.handle_right_type = "AUTO"
    else:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, (x, y) in zip(sp.points, pts):
            p.co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    sp.use_smooth = True
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    cu.materials.append(m)
    return ob


# ---------------------------------------------------------------- icons
def icon_coins():                                   # yellow only
    sc, cam = reset()
    coin = mat("Coin", YELLOW)
    offs = [(0, 0), (0.05, -0.03), (-0.04, 0.03), (0.03, 0.04)]
    for i, (dx, dy) in enumerate(offs):
        z = 0.11 + i * 0.215
        cyl(1.0, 0.2, (dx, dy, z), coin)
        cyl(0.78, 0.214, (dx, dy, z), coin, bevel=0.01)
    c = cyl(1.0, 0.2, (1.55, -0.55, 0.95), coin)
    ci = cyl(0.78, 0.214, (1.55, -0.55, 0.95), coin, bevel=0.01)
    for ob in (c, ci):
        ob.rotation_euler = (math.radians(78), 0, math.radians(-28))
    shoot(sc, cam, "coins")


def icon_pack():                                    # white + red
    sc, cam = reset()
    white = mat("Card", WHITE)
    red = mat("Red", RED)
    box((1.3, 0.62, 1.25), (0, 0, 0.625), white, 0.05)
    box((1.31, 0.63, 0.5), (0, 0, 1.5), red, 0.05)
    em = cyl(0.26, 0.02, (0, -0.315, 0.62), red, verts=64, bevel=0.005)
    em.rotation_euler = (math.radians(90), 0, 0)
    for i, x in enumerate((-0.32, 0.0, 0.32)):
        cyl(0.13, 0.5, (x, 0.02, 1.85 + (0.06 if i == 1 else 0)), white, verts=48, bevel=0.02)
    shoot(sc, cam, "pack")


def icon_drop():                                    # white only: water on the ember, the craving put out
    sc, cam = reset()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    for v in ob.data.vertices:
        x, y, z = v.co
        if z > 0:
            k = (1 - z) ** 1.05
            v.co = Vector((x * k, y * k, z * 1.4))
    ob.location = (0, 0, 1.0)
    smooth(ob)
    ob.modifiers.new("S", "SUBSURF").levels = 1
    ob.data.materials.append(mat("Water", WHITE))
    shoot(sc, cam, "drop")


def heart_outline(n=64, valley=0.2):
    """Two round lobes, a small round valley between them, and two straight sides meeting
    at an ~86° point. Every concave curve is rounder than the bevel, so nothing spikes
    (the parametric heart has zero-angle cusps)."""
    cx, cy, r = 0.5, 0.3, 0.52
    bottom = (0.0, -1.0)
    span = lambda a, b, k: [a + (b - a) * i / k for i in range(k + 1)]
    d = math.hypot(cx, cy - bottom[1])
    cp = math.atan2(bottom[1] - cy, cx)
    t0 = cp - math.acos(r / d)                              # outer tangent point on the left lobe
    yc = cy + math.sqrt((r + valley) ** 2 - cx ** 2)        # centre of the valley circle
    tv = math.atan2(yc - cy, cx)                            # where the left lobe meets the valley
    left = [(-cx + r * math.cos(a), cy + r * math.sin(a)) for a in span(t0, tv - 2 * math.pi, n)]
    v0, v1 = math.atan2(cy - yc, -cx), math.atan2(cy - yc, cx)
    dip = [(valley * math.cos(a), yc + valley * math.sin(a)) for a in span(v0, v1, 16)][1:-1]
    right = [(-x, y) for x, y in reversed(left)]
    return [bottom] + left + dip + right


def icon_heart():                                   # red only
    sc, cam = reset()
    ob = outline("Heart", heart_outline(), 0.14, 0.14, mat("HeartRed", RED))
    ob.rotation_euler = (math.radians(90), 0, 0)
    ob.location = (0, 0, 1.1)
    shoot(sc, cam, "heart")


def shield_outline(scale=1.0, n=28):
    half = []
    for i in range(n + 1):                      # top edge, a gentle arch
        t = i / n
        half.append((0.9 * t, 1.08 - 0.1 * t * t))
    for i in range(1, n + 1):                   # straight side
        t = i / n
        half.append((0.9, 0.98 - 0.8 * t))
    for i in range(1, n + 1):                   # curve into the tip
        t = i / n
        x = (1 - t) ** 2 * 0.9 + 2 * (1 - t) * t * 0.86
        y = (1 - t) ** 2 * 0.18 + 2 * (1 - t) * t * -0.62 + t * t * -1.1
        half.append((x, y))
    left = [(-x, y) for x, y in reversed(half[1:-1])]
    return [(x * scale, y * scale) for x, y in half + left]


def icon_shield():                                  # yellow + red
    sc, cam = reset()
    ob = outline("Shield", shield_outline(), 0.14, 0.12, mat("ShieldYellow", YELLOW))
    ob2 = outline("ShieldIn", [(x, y + 0.02) for x, y in shield_outline(0.68)], 0.2, 0.07, mat("ShieldRed", RED))
    for o in (ob, ob2):
        o.rotation_euler = (math.radians(90), 0, 0)
        o.location = (0, 0, 1.1)
    ob2.location.y = -0.08
    shoot(sc, cam, "shield")


def icon_gum():                                     # white pieces on an ink tray, tilted toward the camera
    sc, cam = reset()
    white = mat("Gum", WHITE)
    tray = mat("Tray", INK)
    parts = [
        box((2.2, 1.35, 0.06), (0, 0, 0.03), tray, 0.12, 6),
        box((0.95, 0.58, 0.3), (-0.45, 0.05, 0.25), white, 0.14, 8),
        box((0.95, 0.58, 0.3), (0.55, -0.18, 0.25), white, 0.14, 8),
    ]
    parts[1].rotation_euler = (0, 0, math.radians(12))
    parts[2].rotation_euler = (0, 0, math.radians(-18))
    pivot = bpy.data.objects.new("GumPivot", None)
    sc.collection.objects.link(pivot)
    for p in parts:
        p.parent = pivot
    pivot.rotation_euler = (math.radians(30), 0, math.radians(-8))   # top turned toward the camera
    shoot(sc, cam, "gum")


def icon_patch():                                   # white patch + yellow pad, propped toward the camera
    sc, cam = reset()
    n = 96

    def superellipse(a, p=4.5):
        out = []
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s = math.cos(t), math.sin(t)
            out.append((a * math.copysign(abs(c) ** (2 / p), c), a * math.copysign(abs(s) ** (2 / p), s)))
        return out
    p1 = outline("Patch", superellipse(1.0), 0.04, 0.025, mat("Patch", WHITE))
    p2 = outline("Core", superellipse(0.5, 3.2), 0.05, 0.02, mat("Core", YELLOW))   # square pad, like a real patch
    p2.location.z = 0.035
    pivot = bpy.data.objects.new("PatchPivot", None)
    sc.collection.objects.link(pivot)
    p1.parent = p2.parent = pivot
    pivot.rotation_euler = (math.radians(48), 0, math.radians(-14))  # propped up, facing the camera
    shoot(sc, cam, "patch")


def icon_target():                                  # red + white
    sc, cam = reset()
    red = mat("Red", RED)
    white = mat("White", WHITE)
    rings = [(1.0, 0.18, red), (0.76, 0.24, white), (0.52, 0.3, red), (0.28, 0.36, white), (0.12, 0.42, red)]
    for r, d, m in rings:
        p = cyl(r, d, (0, 0, 0), m)
        p.rotation_euler = (math.radians(90), 0, 0)
        p.location = (0, 0, 1.1)
    shoot(sc, cam, "target")


for name in ONLY:
    globals()[f"icon_{name}"]()
print("DONE")
