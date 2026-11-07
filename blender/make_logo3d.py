"""
طفّيها — the mark in 3D: the open ring and the put-out cigarette (tilted 22°, grey ash, a last wisp).

  ring      white satin, square section with soft bevels, open ~100° at the top
  cigarette ash (grey, rough) · paper (warm white) · a thin ink band · filter (cork yellow, speckled)
  smoke     one thin wisp rising from the ash, fading out
  light     warm key from the top left, cool rim from behind, soft fill; ink backdrop

Run:
  blender.exe -b --factory-startup -P make_logo3d.py -- ../assets/store [size] [samples]
Writes tafiha-mark-3d-front.png and tafiha-mark-3d-angle.png.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
OUT = os.path.abspath(args[0]) if args else os.path.dirname(os.path.abspath(__file__))
SIZE = int(args[1]) if len(args) > 1 else 1400
SAMPLES = int(args[2]) if len(args) > 2 else 160
os.makedirs(OUT, exist_ok=True)

RED, YELLOW, WHITE, INK, ASH = "#E1261C", "#E5A548", "#F4F1EC", "#1B1716", "#B9B4AE"


def lin(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), a)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, color, rough, bump=0.0, bump_scale=60.0, speckle=None, coat=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = rough
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.25
    if speckle:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 140.0
        noise.inputs["Detail"].default_value = 6.0
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.45
        ramp.color_ramp.elements[0].color = lin(color)
        ramp.color_ramp.elements[1].position = 0.72
        ramp.color_ramp.elements[1].color = lin(speckle)
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = lin(color)
    if bump:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = bump_scale
        tex.inputs["Detail"].default_value = 8.0
        bn = nt.nodes.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump
        bn.inputs["Distance"].default_value = 0.02
        nt.links.new(tex.outputs["Fac"], bn.inputs["Height"])
        nt.links.new(bn.outputs["Normal"], b.inputs["Normal"])
    return m


def bevel(obj, width, segments=5):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40)
    obj.modifiers.new("smooth", "WEIGHTED_NORMAL") if hasattr(bpy.types, "WeightedNormalModifier") else None
    return mod


# ---------------------------------------------------------------- the ring
R_OUT, R_IN, DEPTH = 1.0, 0.54, 0.34
GAP = 100.0                     # degrees open at the top
a0, a1 = 90 + GAP / 2, 90 - GAP / 2 + 360
STEPS = 160

bm = bmesh.new()
rings = []
for i in range(STEPS + 1):
    a = math.radians(a0 + (a1 - a0) * i / STEPS)
    c, s = math.cos(a), math.sin(a)
    pts = [(R_IN * c, -DEPTH / 2, R_IN * s), (R_OUT * c, -DEPTH / 2, R_OUT * s),
           (R_OUT * c, DEPTH / 2, R_OUT * s), (R_IN * c, DEPTH / 2, R_IN * s)]
    rings.append([bm.verts.new(p) for p in pts])
for i in range(STEPS):
    for k in range(4):
        bm.faces.new((rings[i][k], rings[i][(k + 1) % 4], rings[i + 1][(k + 1) % 4], rings[i + 1][k]))
bm.faces.new(list(reversed(rings[0])))
bm.faces.new(rings[-1])
bm.normal_update()
mesh = bpy.data.meshes.new("ring")
bm.to_mesh(mesh)
bm.free()
ring = bpy.data.objects.new("ring", mesh)
scene.collection.objects.link(ring)
for p in mesh.polygons:
    p.use_smooth = True
bevel(ring, 0.045, 6)
ring.data.materials.append(material("ring", WHITE, 0.32, coat=0.35))

# ---------------------------------------------------------------- the cigarette
TILT = math.radians(22)          # top leans left
axis = Vector((-math.sin(TILT), 0, math.cos(TILT)))
R_CIG = 0.205
start = Vector((0, 0, 0)) - axis * 0.24   # ash end, just below the ring's centre
PARTS = [  # name, length, colour, roughness, bump, speckle
    ("ash", 0.27, ASH, 0.95, 0.9, "#8F8A84"),
    ("paper", 0.98, WHITE, 0.55, 0.08, None),
    ("band", 0.045, INK, 0.5, 0.0, None),
    ("filter", 0.66, YELLOW, 0.7, 0.15, "#C8862E"),
]
rot = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
pos = 0.0
for name, length, color, rough, bmp, speck in PARTS:
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=R_CIG * (0.985 if name == "band" else 1.0), depth=length)
    o = bpy.context.active_object
    o.name = name
    centre = start + axis * (pos + length / 2)
    o.matrix_world = Matrix.Translation(centre) @ rot
    bpy.ops.object.shade_smooth()
    if name in ("ash", "filter", "paper"):
        bevel(o, 0.03 if name != "ash" else 0.06, 6)
    o.data.materials.append(material(name, color, rough, bmp, 90 if name == "ash" else 40, speck))
    pos += length

# ---------------------------------------------------------------- the last wisp of smoke
tip = start + Vector((0, 0.05, 0))
curve = bpy.data.curves.new("wisp", "CURVE")
curve.dimensions = "3D"
curve.bevel_depth = 0.014
curve.bevel_resolution = 4
spline = curve.splines.new("BEZIER")
pts = [tip + Vector((0.0, 0.02, -0.02)), Vector((0.16, 0.18, 0.55)), Vector((0.06, 0.18, 1.05)),
       Vector((0.20, 0.18, 1.55)), Vector((0.10, 0.18, 2.0))]
spline.bezier_points.add(len(pts) - 1)
for bp, p in zip(spline.bezier_points, pts):
    bp.co = p
    bp.handle_left_type = bp.handle_right_type = "AUTO"
    bp.radius = 1.0
spline.bezier_points[-1].radius = 0.35
wisp = bpy.data.objects.new("wisp", curve)
scene.collection.objects.link(wisp)
m = bpy.data.materials.new("smoke")
try:
    m.use_nodes = True
except Exception:
    pass
nt = m.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
outn = nt.nodes.new("ShaderNodeOutputMaterial")
emit = nt.nodes.new("ShaderNodeEmission")
emit.inputs["Color"].default_value = lin("#C9C4BF")
emit.inputs["Strength"].default_value = 0.9
clear = nt.nodes.new("ShaderNodeBsdfTransparent")
mix = nt.nodes.new("ShaderNodeMixShader")
coord = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.15
ramp.color_ramp.elements[0].color = (0.25, 0.25, 0.25, 1)   # 75% visible near the ash
ramp.color_ramp.elements[1].position = 0.95
ramp.color_ramp.elements[1].color = (1, 1, 1, 1)            # gone at the top
nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
nt.links.new(emit.outputs["Emission"], mix.inputs[1])
nt.links.new(clear.outputs["BSDF"], mix.inputs[2])
nt.links.new(mix.outputs["Shader"], outn.inputs["Surface"])
if hasattr(m, "blend_method"):
    m.blend_method = "BLEND"
wisp.data.materials.append(m)
wisp.visible_shadow = False

# ---------------------------------------------------------------- backdrop and light
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 6.0, 0), rotation=(math.radians(90), 0, 0))
back = bpy.context.active_object
back.data.materials.append(material("backdrop", "#141110", 0.9))

world = bpy.data.worlds.new("world")
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
world.node_tree.nodes["Background"].inputs["Color"].default_value = lin("#0E0C0B")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.4


def area(name, loc, energy, size, color, target=(0, 0, 0.2)):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy
    d.size = size
    d.color = color
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    direction = Vector(target) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return o


area("key", (-3.2, -4.0, 4.0), 900, 3.5, (1.0, 0.93, 0.84))
area("fill", (4.0, -3.5, 0.5), 220, 5.0, (0.92, 0.95, 1.0))
area("rim", (2.5, 2.5, 3.5), 700, 1.5, (1.0, 0.86, 0.72))
area("ember", (0, -1.5, -2.5), 60, 2.0, (1.0, 0.35, 0.22))   # a faint warm glow from below

# ---------------------------------------------------------------- render
scene.render.engine = "CYCLES"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 85
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 5.6
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
FOCUS = Vector((-0.08, 0, 0.3))
cam_data.dof.focus_distance = 11.0


def shoot(name, az, el, dist=11.0):
    a, e = math.radians(az), math.radians(el)
    cam.location = FOCUS + Vector((dist * math.sin(a) * math.cos(e), -dist * math.cos(a) * math.cos(e), dist * math.sin(e)))
    cam.rotation_euler = (FOCUS - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, f"tafiha-mark-3d-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", scene.render.filepath)


if os.environ.get("TAFIHA_SCENE_ONLY") != "1":  # make_logo3d_anim.py builds on this scene
    shoot("front", 0, 6)
    shoot("angle", -28, 14)
