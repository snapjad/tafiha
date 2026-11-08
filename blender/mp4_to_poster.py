"""
Writes one frame of an MP4 as a WebP still (the video's poster, shown before it plays).

  blender.exe -b --factory-startup -P mp4_to_poster.py -- <in.mp4> <out.webp> [frame] [size]
"""
import bpy
import os
import sys

args = sys.argv[sys.argv.index("--") + 1:]
src, out = os.path.abspath(args[0]), os.path.abspath(args[1])
frame = int(args[2]) if len(args) > 2 else 1
size = int(args[3]) if len(args) > 3 else 600

scene = bpy.context.scene
scene.sequence_editor_create()
seqs = scene.sequence_editor.strips if hasattr(scene.sequence_editor, "strips") else scene.sequence_editor.sequences
movie = seqs.new_movie("movie", src, channel=1, frame_start=1)
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.resolution_percentage = 100
if hasattr(movie, "transform"):
    w, h = movie.elements[0].orig_width, movie.elements[0].orig_height
    if w and h:
        movie.transform.scale_x = movie.transform.scale_y = size / max(w, h)
scene.frame_start = scene.frame_end = scene.frame_current = frame
s = scene.render.image_settings
if hasattr(s, "media_type"):
    s.media_type = "IMAGE"
s.file_format = "WEBP"
s.quality = 82
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
