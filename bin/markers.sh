#!/bin/bash

nominatimall() {

echo -n "{"

first=yes
sed -r -n -e 's/.*src=(upload[^"]+).*/\1/p' index.html | while read dir ; do
    json=$(cat $dir/nominatim.json)
    [ -z "$json" ] && continue
    [ -z "$first" ] && echo \,
    first=""
    echo -n \"${dir}\":
    echo -n $json
done
echo -n "}"

}

nominatimall > markers.json


