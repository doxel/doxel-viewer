# doxel-viewer

Pointcloud viewer for https://github.com/doxel/doxel-angular

Actually a wrapper for Potree to display openMVG pointclouds featuring:
 - thumbnails bar with original images
 - smooth camera transitions between estimated camera locations (while scrolling the thumbs bar or in play mode)
 - relative camera positioning (click on the current thumbnail to switch between relative and original camera position)
 - play mode, to move the camera along all the estimated camera locations (or relatively: you can move the camera during or before the animation)
 - camera frustum display
 - undistorted image overlay
 - show location on map from exif GPS info

