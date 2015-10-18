#!/bin/bash

WEBROOT=doxel-viewer

[ -z "$LC_ALL" ] && export LC_ALL="en_US.UTF-8"

set -e
set -v

# only one file ?
if ! stat PMVS/models/option-0001.ply >/dev/null 2>&1 ; then
  if [ $(find PMVS/models -name '*.ply' | wc -l) -ne 1 ] ; then
    echo "error: more than one ply in $PWD/PMVS/models/" >&2
    echo "PLY not following option-nnnn.ply naming convention ?" >&2
    exit 1
  fi

  PLY=PMVS/models/option-0000.ply

else
  # merge PMVS/models/*ply into /PMVS/models/option-0000_MERGED*.ply
  plymergeall

  PLY=PMVS/models/option-????_MERGED*.ply
fi

# convert pointcloud
PotreeConverter -p potree -o $(pwd)/potree $(pwd)/$PLY --overwrite
[ -n "$STOP" ] && exit

# replace default SizeType
sed -r -i -e 's/"Adaptive"/"Fixed"/' potree/examples/potree.js

mkdir -p viewer

# export views and poses
openMVG_main_ConvertSfM_DataFormat  -I -V -E  -i openMVG/robust.json -o ./viewer/viewer.json

# generate jpeg_metadata_index.bin and jpeg_metadata.bin
pushd .
cd original_images
jpeg_metadata $(poses $PWD/../viewer/viewer.json)
mv jpeg_*.bin ../viewer
popd

# set initial pose
viewer_initialpose $PWD/viewer/viewer.json >> potree/examples/potree.js

# export frustums
openMVG_main_ExportCameraFrustums -i openMVG/robust.json -o ./viewer/frustums.ply

# redirect page
cat > viewer/index.html << EOF
<!DOCTYPE html>
<html>
  <head>
    <script>
        window.location="/$WEBROOT/viewer.html";
    </script>
  </head>
</html>
EOF

# generate nominatim.json
[ -f nominatim.json ] || poses $PWD/viewer/viewer.json | georef original_images 
