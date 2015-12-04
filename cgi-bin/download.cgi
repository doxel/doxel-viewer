#!/bin/bash
set -e
DOXEL_VIEWER_DATA_PATH=/var/www/doxel-viewer/upload
SEGMENT_PATH=$(realpath $DOXEL_VIEWER_DATA_PATH/$QUERY_STRING)

# the year plus the five child directory names following the year
SEGMENT_DIRECTORY=$(echo $SEGMENT_PATH | sed -r -n -e 's,.*/([0-9]{4}(/[^/]+){5}).*$,\1,p')
SEGMENT_NAME=$(echo $SEGMENT_DIRECTORY | tr '/' '-')

if [ -z "$SEGMENT_NAME" ] ; then # -o ! -d $SEGMENT_DIRECTORY/original_images ] ; then
    echo Content-type: text/plain
    echo
    echo invalid path: $QUERY_STRING
    exit 0
fi

# generate config.js
TMPDIR=$(mktemp -d XXXXXXXXXX.tmp)
mkdir -p $TMPDIR/doxel-viewer/js
echo "viewer.segmentURL='$SEGMENT_DIRECTORY'" > $TMPDIR/doxel-viewer/js/config.js

# http headers
echo Content-type: application/tar
echo "Content-Disposition: attachment; filename=${SEGMENT_NAME}.tar"
echo

# build archive
tar -c -C /var/www/ doxel-viewer/upload/$SEGMENT_DIRECTORY $(cd /var/www ; find doxel-viewer -not -type l -print) -C $TMPDIR doxel-viewer

rm $TMPDIR -r

