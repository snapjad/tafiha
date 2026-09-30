"""
طفّيها — 3D icons for the dashboard (transparent, square).

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

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
OUT = os.path.abspath(args[0]) if args else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "icons"))
MODE = args[1] if len(args) > 1 else "final"
ALL = ["coins", "pack", "drop", "heart", "shield", "gum", "patch", "target"]
ONLY = args[2].split(",") if len(args) > 2 else ALL
os.makedirs(OUT, exist_ok=True)
SIZE = 400


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def mat(name, color, rough=0.35, metal=0.0, coat=0.0, sss=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.05
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Scale"].default_value = 0.05
    return m


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24 if MODE == "test" else 128
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
    bg.inputs["Strength"].default_value = 0.55
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 70
    for name, loc, power, size, color in (
        ("Key", (-4, -5, 7), 700, 5, "#FFFFFF"),
        ("Fill", (5, -3, 2), 220, 4, "#FFFFFF"),
        ("Rim", (1, 6, 3.5), 520, 3, "#FFD2C4"),
    ):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = power
        ld.size = size
        ld.color = lin(color)[:3]
        ob = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(ob)
        ob.location = loc
        look_at(ob, (0, 0, 0.3))
    return sc, cam


def shoot(sc, cam, name, target=(0, 0, 0.3), dist=9.0, az=24, el=26):
    a, e = math.radians(az), math.radians(el)
    cam.location = (target[0] + dist * math.cos(e) * math.sin(a),
                    target[1] - dist * math.cos(e) * math.cos(a),
                    target[2] + dist * math.sin(e))
    look_at(cam, target)
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
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
def icon_coins():
    sc, cam = reset()
    gold = mat("Gold", "#E9B04C", 0.22, 1.0)
    inner = mat("GoldIn", "#D89A38", 0.32, 1.0)
    offs = [(0, 0), (0.05, -0.03), (-0.04, 0.03), (0.03, 0.04)]
    for i, (dx, dy) in enumerate(offs):
        z = 0.11 + i * 0.215
        cyl(1.0, 0.2, (dx, dy, z), gold)
        cyl(0.78, 0.206, (dx, dy, z), inner, bevel=0.01)
    c = cyl(1.0, 0.2, (1.55, -0.55, 0.95), gold)
    ci = cyl(0.78, 0.206, (1.55, -0.55, 0.95), inner, bevel=0.01)
    for ob in (c, ci):
        ob.rotation_euler = (math.radians(78), 0, math.radians(-28))
    shoot(sc, cam, "coins", target=(0.62, -0.2, 0.6), dist=8.8)


def icon_pack():
    sc, cam = reset()
    white = mat("Card", "#F6F5F2", 0.45, sss=0.05)
    red = mat("Red", "#E1261C", 0.35, coat=0.4)
    gold = mat("Gold", "#E5A548", 0.25, 0.9)
    box((1.3, 0.62, 1.25), (0, 0, 0.625), white, 0.05)
    box((1.31, 0.63, 0.5), (0, 0, 1.5), red, 0.05)
    box((1.315, 0.635, 0.05), (0, 0, 1.24), gold, 0.02, 3)
    em = cyl(0.26, 0.02, (0, -0.315, 0.62), red, verts=64, bevel=0.005)
    em.rotation_euler = (math.radians(90), 0, 0)
    for i, x in enumerate((-0.32, 0.0, 0.32)):
        f = cyl(0.13, 0.5, (x, 0.02, 1.85 + (0.06 if i == 1 else 0)), mat(f"Filter{i}", "#E3A248", 0.5), verts=48, bevel=0.02)
    shoot(sc, cam, "pack", target=(0, 0, 1.05), dist=7.4, az=28, el=20)


def icon_drop():
    sc, cam = reset()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    for v in ob.data.vertices:
        x, y, z = v.co
        if z > 0:
            k = (1 - z) ** 1.25
            v.co = Vector((x * k, y * k, z * 1.55))
    ob.location = (0, 0, 1.0)
    smooth(ob)
    ob.modifiers.new("S", "SUBSURF").levels = 1
    blue = mat("Water", "#3FA7F2", 0.08, coat=1.0)
    blue.node_tree.nodes.get("Principled BSDF").inputs["Transmission Weight"].default_value = 0.35
    ob.data.materials.append(blue)
    shoot(sc, cam, "drop", target=(0, 0, 1.25), dist=9.0, az=18, el=16)


def icon_heart():
    sc, cam = reset()
    pts = []
    for i in range(40):
        t = 2 * math.pi * i / 40
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 16, y / 16))
    ob = outline("Heart", pts, 0.12, 0.3, mat("HeartRed", "#E1261C", 0.28, coat=1.0), bezier=True)
    ob.rotation_euler = (math.radians(90), 0, 0)
    ob.location = (0, 0, 1.1)
    shoot(sc, cam, "heart", target=(0, 0, 1.0), dist=8.5, az=22, el=12)


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


def icon_shield():
    sc, cam = reset()
    ob = outline("Shield", shield_outline(), 0.14, 0.12, mat("ShieldGold", "#E5A548", 0.25, 0.85, coat=0.6))
    ob2 = outline("ShieldIn", [(x, y + 0.02) for x, y in shield_outline(0.68)], 0.2, 0.07, mat("ShieldRed", "#E1261C", 0.3, coat=0.8))
    for o in (ob, ob2):
        o.rotation_euler = (math.radians(90), 0, 0)
        o.location = (0, 0, 1.1)
    ob2.location.y = -0.08
    shoot(sc, cam, "shield", target=(0, 0, 1.05), dist=8.5, az=22, el=12)


def icon_gum():
    sc, cam = reset()
    white = mat("Gum", "#F7F6F2", 0.3, coat=0.5, sss=0.1)
    foil = mat("Foil", "#C9CDD3", 0.18, 1.0)
    base = box((2.2, 1.35, 0.06), (0, 0, 0.03), foil, 0.12, 6)
    base.rotation_euler = (0, 0, math.radians(-8))
    a = box((0.95, 0.58, 0.3), (-0.45, 0.05, 0.25), white, 0.14, 8)
    b = box((0.95, 0.58, 0.3), (0.55, -0.18, 0.25), white, 0.14, 8)
    a.rotation_euler = (0, 0, math.radians(12))
    b.rotation_euler = (0, 0, math.radians(-18))
    shoot(sc, cam, "gum", target=(0, 0, 0.2), dist=7.5, az=20, el=38)


def icon_patch():
    sc, cam = reset()
    n = 96
    def superellipse(a, p=4.5):
        out = []
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s = math.cos(t), math.sin(t)
            out.append((a * math.copysign(abs(c) ** (2 / p), c), a * math.copysign(abs(s) ** (2 / p), s)))
        return out
    skin = mat("Patch", "#F0DCC4", 0.55, sss=0.15)
    core = mat("Core", "#E3BF93", 0.4)
    p1 = outline("Patch", superellipse(1.0), 0.03, 0.02, skin)
    circ = [(0.52 * math.cos(2 * math.pi * i / n), 0.52 * math.sin(2 * math.pi * i / n)) for i in range(n)]
    p2 = outline("Core", circ, 0.05, 0.02, core)
    p1.rotation_euler = p2.rotation_euler = (0, 0, math.radians(-14))
    p2.location.z = 0.03
    shoot(sc, cam, "patch", target=(0, 0, 0.0), dist=7.5, az=16, el=48)


def icon_target():
    sc, cam = reset()
    red = mat("Red", "#E1261C", 0.3, coat=0.6)
    white = mat("White", "#F6F5F2", 0.35)
    rings = [(1.0, 0.18, red), (0.76, 0.24, white), (0.52, 0.3, red), (0.28, 0.36, white), (0.12, 0.42, red)]
    for r, d, m in rings:
        p = cyl(r, d, (0, 0, 0), m)
        p.rotation_euler = (math.radians(90), 0, 0)
        p.location = (0, 0, 1.1)
    shoot(sc, cam, "target", target=(0, 0, 1.1), dist=8.0, az=24, el=14)


for name in ONLY:
    globals()[f"icon_{name}"]()
print("DONE")
