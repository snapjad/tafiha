"""
Joins rendered PNG frames into an H.264 MP4 with Blender's own video encoder (no ffmpeg install needed).

  blender.exe -b --factory-startup -P frames_to_mp4.py -- <frames_dir> <out.mp4> [fps]
"""
import bpy
import os
import sys

args = sys.argv[sys.argv.index("--") + 1:]
src, out = os.path.abspath(args[0]), os.path.abspath(args[1])
fps = int(args[2]) if len(args) > 2 else 30
files = sorted(f for f in os.listdir(src) if f.endswith(".png"))

scene = bpy.context.scene
scene.sequence_editor_create()
seqs = scene.sequence_editor.strips if hasattr(scene.sequence_editor, "strips") else scene.sequence_editor.sequences
strip = seqs.new_image("frames", os.path.join(src, files[0]), channel=1, frame_start=1)
for f in files[1:]:
    strip.elements.append(f)
img = bpy.data.images.load(os.path.join(src, files[0]))
scene.render.resolution_x, scene.render.resolution_y = img.size
scene.render.resolution_percentage = 100
scene.render.fps = fps
scene.frame_start, scene.frame_end = 1, len(files)
s = scene.render.image_settings
if hasattr(s, "media_type"):
    s.media_type = "VIDEO"
s.file_format = "FFMPEG"
ff = scene.render.ffmpeg
ff.format = "MPEG4"
ff.codec = "H264"
ff.constant_rate_factor = "HIGH"
ff.ffmpeg_preset = "GOOD"
scene.render.filepath = out
bpy.ops.render.render(animation=True)
print("wrote", out)
