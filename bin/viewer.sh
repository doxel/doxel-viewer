#!/bin/bash

WEBROOT=doxel-viewer

[ -z "$LC_ALL" ] && export LC_ALL="en_US.UTF-8"

set -e
set -v

[ -z "$PLY" ] && PLY=$(pwd)/PMVS/models/option-????.ply

# convert pointcloud
PotreeConverter -p potree -o $(pwd)/potree $PLY --overwrite
[ -n "$STOP" ] && exit

# replace default SizeType
sed -r -i -e 's/"Adaptive"/"Fixed"/' potree/examples/potree.js

mkdir -p viewer

# export views and poses
openMVG_main_ConvertSfM_DataFormat -I -V -E  -i $(pwd)/openMVG/robust.json -o $(pwd)/viewer/viewer.json

WD=$(pwd)
LEN=${#WD}
RELPLY=$(sed -r -e 's/^\///' <<< ${PLY:$LEN})

[[ "$(basename $RELPLY)" =~ "?" ]] && RELPLY=$(dirname $RELPLY) 

cat > viewer/doxel.json << EOF
{
  "ply" : "$RELPLY"
}
EOF

# generate jpeg_metadata_index.bin and jpeg_metadata.bin
pushd .
doxel-viewer-thumbs
popd

# set initial pose
viewer_initialpose $PWD/viewer/viewer.json >> potree/examples/potree.js

# export frustums
openMVG_main_ExportCameraFrustums -i $(pwd)/openMVG/robust.json -o $(pwd)/viewer/frustums.ply

# redirect page
cat > viewer/viewer.html << EOF
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

