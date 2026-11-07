"""
طفّيها — the 3D mark, animated: the tip burns red, goes out to grey ash, and real (simulated) smoke
rises from it, thick while it burns, then a last thinning trail.

  frames   1–60 burning (flickering ember, glow on the ring), 60–105 going out, to 150 the smoke clears
  smoke    Blender's smoke simulation (Mantaflow) from the tip; the cigarette is an obstacle,
           so the smoke climbs along it

Run:
  blender.exe -b --factory-startup -P make_logo3d_anim.py -- <out_dir> [size] [samples] [frames]
Writes <out_dir>/frames/####.png, plus still-burning.png and still-out.png.
"""
import bpy
import math
import os
import sys
from mathutils import Vector

here = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
OUT = os.path.abspath(args[0]) if args else os.path.join(here, "anim")
SIZE = int(args[1]) if len(args) > 1 else 1080
SAMPLES = int(args[2]) if len(args) > 2 else 64
FRAMES = args[3] if len(args) > 3 else "all"
os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)

# the still scene: ring, cigarette, backdrop, lights, camera
os.environ["TAFIHA_SCENE_ONLY"] = "1"
sys.argv = [argv[0], "--", OUT, str(SIZE), str(SAMPLES)]
exec(compile(open(os.path.join(here, "make_logo3d.py"), encoding="utf-8").read(), "make_logo3d.py", "exec"))

scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, 150
scene.render.fps = 30
LIT_END, OUT_END = 60, 105

# the drawn wisp gives way to real smoke
bpy.data.objects.remove(bpy.data.objects["wisp"], do_unlink=True)

# ---------------------------------------------------------------- the ember, then ash
ash = bpy.data.objects["ash"]
m = bpy.data.materials.new("ember")
try:
    m.use_nodes = True
except Exception:
    pass
nt = m.node_tree
b = nt.nodes.get("Principled BSDF")
b.inputs["Roughness"].default_value = 0.95

burn = nt.nodes.new("ShaderNodeValue")          # 1 = burning, 0 = out
burn.outputs[0].default_value = 1.0
burn.outputs[0].keyframe_insert("default_value", frame=LIT_END)
burn.outputs[0].default_value = 0.0
burn.outputs[0].keyframe_insert("default_value", frame=OUT_END)

cracks = nt.nodes.new("ShaderNodeTexNoise")      # ash flecks over the glowing tip
cracks.inputs["Scale"].default_value = 70.0
cracks.inputs["Detail"].default_value = 10.0
flick = nt.nodes.new("ShaderNodeTexNoise")       # slow flicker, animated through W
flick.noise_dimensions = "4D"
flick.inputs["Scale"].default_value = 3.0
flick.inputs["W"].default_value = 0.0
flick.inputs["W"].keyframe_insert("default_value", frame=1)
flick.inputs["W"].default_value = 9.0
flick.inputs["W"].keyframe_insert("default_value", frame=150)

ash_ramp = nt.nodes.new("ShaderNodeValToRGB")    # surface: dark ash flecks / grey ash
ash_ramp.color_ramp.elements[0].position = 0.42
ash_ramp.color_ramp.elements[0].color = lin("#5E5853")
ash_ramp.color_ramp.elements[1].position = 0.62
ash_ramp.color_ramp.elements[1].color = lin(ASH)
nt.links.new(cracks.outputs["Fac"], ash_ramp.inputs["Fac"])

hot = nt.nodes.new("ShaderNodeValToRGB")         # glow colour: deep red in the cracks, orange-yellow hot spots
hot.color_ramp.elements[0].position = 0.3
hot.color_ramp.elements[0].color = lin("#7A0A05")
hot.color_ramp.elements[1].position = 0.7
hot.color_ramp.elements[1].color = lin("#FF5A14")
mid = hot.color_ramp.elements.new(0.5)
mid.color = lin(RED)
nt.links.new(cracks.outputs["Fac"], hot.inputs["Fac"])

# glow strength = burning × flicker × (less where ash flecks sit)
fl = nt.nodes.new("ShaderNodeMapRange")
fl.inputs["To Min"].default_value = 1.6
fl.inputs["To Max"].default_value = 4.5
nt.links.new(flick.outputs["Fac"], fl.inputs["Value"])
fleck = nt.nodes.new("ShaderNodeMapRange")
fleck.inputs["From Min"].default_value = 0.4
fleck.inputs["From Max"].default_value = 0.65
fleck.inputs["To Min"].default_value = 1.0
fleck.inputs["To Max"].default_value = 0.05
nt.links.new(cracks.outputs["Fac"], fleck.inputs["Value"])
m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "MULTIPLY"
m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "MULTIPLY"
nt.links.new(fl.outputs["Result"], m1.inputs[0])
nt.links.new(fleck.outputs["Result"], m1.inputs[1])
nt.links.new(m1.outputs["Value"], m2.inputs[0])
nt.links.new(burn.outputs[0], m2.inputs[1])
emit_color = "Emission Color" if "Emission Color" in b.inputs else "Emission"
nt.links.new(hot.outputs["Color"], b.inputs[emit_color])
nt.links.new(m2.outputs["Value"], b.inputs["Emission Strength"])
# while burning the surface is dark char; once out it is grey ash
base = nt.nodes.new("ShaderNodeMix")
base.data_type = "RGBA"
base.inputs["A"].default_value = (0.0, 0.0, 0.0, 1)
nt.links.new(burn.outputs[0], base.inputs["Factor"])
nt.links.new(ash_ramp.outputs["Color"], base.inputs["A"])
base.inputs["B"].default_value = lin("#2A1512")
nt.links.new(base.outputs["Result"], b.inputs["Base Color"])
bump_tex = nt.nodes.new("ShaderNodeBump")
bump_tex.inputs["Strength"].default_value = 0.9
bump_tex.inputs["Distance"].default_value = 0.02
nt.links.new(cracks.outputs["Fac"], bump_tex.inputs["Height"])
nt.links.new(bump_tex.outputs["Normal"], b.inputs["Normal"])
ash.data.materials.clear()
ash.data.materials.append(m)

# the ember's light on the ring and paper
tip = start + axis * 0.06
glow = bpy.data.lights.new("ember-glow", "POINT")
glow.color = (1.0, 0.36, 0.12)
glow.shadow_soft_size = 0.15
glow.energy = 45.0
glow.keyframe_insert("energy", frame=LIT_END)
glow.energy = 0.0
glow.keyframe_insert("energy", frame=OUT_END)
g = bpy.data.objects.new("ember-glow", glow)
g.location = tip + Vector((0, -0.25, -0.05))
scene.collection.objects.link(g)

# ---------------------------------------------------------------- the smoke
bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.2, 0, 1.15))
domain = bpy.context.active_object
domain.name = "smoke"
domain.scale = (2.6, 1.4, 3.4)
bpy.ops.object.transform_apply(scale=True)
fm = domain.modifiers.new("fluid", "FLUID")
fm.fluid_type = "DOMAIN"
d = fm.domain_settings
d.domain_type = "GAS"
d.resolution_max = 160
d.cache_type = "REPLAY"
d.cache_directory = os.path.join(OUT, "cache")
d.cache_frame_start, d.cache_frame_end = 1, 150
d.vorticity = 0.35
d.alpha = 0.0          # smoke weight: neutral
d.beta = 4.0           # heat lifts it
d.use_dissolve_smoke = True
d.dissolve_speed = 110
d.use_dissolve_smoke_log = True
d.use_adaptive_domain = False
d.time_scale = 1.3

vm = bpy.data.materials.new("smoke")
try:
    vm.use_nodes = True
except Exception:
    pass
vnt = vm.node_tree
for n in list(vnt.nodes):
    vnt.nodes.remove(n)
vout = vnt.nodes.new("ShaderNodeOutputMaterial")
vol = vnt.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Color"].default_value = lin("#D8D3CE")
vol.inputs["Density"].default_value = 6.0
vol.inputs["Anisotropy"].default_value = 0.35
vnt.links.new(vol.outputs["Volume"], vout.inputs["Volume"])
domain.data.materials.append(vm)

# source: a small sphere in the burning tip, on while it burns and fading as it goes out
# just past the burning end: a source inside an obstacle would be blocked
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=start - axis * 0.06)
src = bpy.context.active_object
src.name = "smoke-source"
src.hide_render = True
sm = src.modifiers.new("fluid", "FLUID")
sm.fluid_type = "FLOW"
f = sm.flow_settings
f.flow_type = "SMOKE"
f.flow_behavior = "INFLOW"
f.flow_source = "MESH"
f.surface_distance = 0.05
f.volume_density = 1.0
f.smoke_color = (0.85, 0.83, 0.8)
f.temperature = 1.6
f.density = 1.0
f.keyframe_insert("density", frame=LIT_END)
f.keyframe_insert("temperature", frame=LIT_END)
f.density = 0.0
f.temperature = 0.0
f.keyframe_insert("density", frame=OUT_END + 5)
f.keyframe_insert("temperature", frame=OUT_END + 5)

# the cigarette and ring are in the smoke's way
for name in ("paper", "band", "filter", "ring"):
    em = bpy.data.objects[name].modifiers.new("fluid", "FLUID")
    em.fluid_type = "EFFECTOR"
    em.effector_settings.effector_type = "COLLISION"

# ---------------------------------------------------------------- render
scene.cycles.samples = SAMPLES
scene.cycles.volume_step_rate = 1.5 if hasattr(scene.cycles, "volume_step_rate") else None
scene.render.resolution_x = scene.render.resolution_y = SIZE
cam.location = FOCUS + Vector((0, -11.0 * math.cos(math.radians(6)), 11.0 * math.sin(math.radians(6))))
cam.rotation_euler = (FOCUS - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.image_settings.file_format = "PNG"

# the smoke is simulated frame by frame from the start, so frames always render in order
frames = range(1, 151) if FRAMES == "all" else [int(x) for x in FRAMES.split(",")]
stills = {45: "still-burning", 150: "still-out"}
for fr in range(1, max(frames) + 1):
    scene.frame_set(fr)
    if fr in frames:
        scene.render.filepath = os.path.join(OUT, "frames", f"{fr:04d}.png")
        bpy.ops.render.render(write_still=True)
        print("frame", fr, flush=True)
        if fr in stills:
            import shutil
            shutil.copy(scene.render.filepath, os.path.join(OUT, stills[fr] + ".png"))
