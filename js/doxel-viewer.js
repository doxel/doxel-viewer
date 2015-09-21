/*
 * doxel-viewer.js
 *
 * Copyright (c) 2015 ALSENET SA - http://doxel.org
 * Please read <http://doxel.org/license> for more information.
 *
 * Author(s):
 *
 *      Rurik Bogdanov <rurik.bugdanov@alsenet.com>
 *
 * This file is part of the DOXEL project <http://doxel.org>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Additional Terms:
 *
 *      You are required to preserve legal notices and author attributions in
 *      that material or in the Appropriate Legal Notices displayed by works
 *      containing it.
 *
 *      You are required to attribute the work as explained in the "Usage and
 *      Attribution" section of <http://doxel.org/license>.
 */


var History=window.History;

$(document).ready(function(){

    viewer.segmentURL='upload/2015/09/02/14412040/2f4acd908588c2590ee06cb67187c85b/1441204044_000000';

    $('iframe').attr('src',viewer.segmentURL+'/potree');

    $.ajax({
      url: viewer.segmentURL+'/viewer.json',
      success: function(json) {
        viewer.data=json;
        viewer.init();
      },
      error: function(){
        alert('could not load pointcloud metadata');
      }
    });

    $(window).on('resize',function(){
      $('iframe').height(window.innerHeight-$('iframe').offset().top);
    }).resize();

});

/**
* @object viewer
*/
var viewer={

    /**
    * @method viewer.init
    */
    init: function viewer_init() {

        viewer.addThumbnails();
        viewer.loadThumbnails();

        $('#thumbnails').mCustomScrollbar({
          axis: 'x'
        });


        // init map
        var map = viewer.map = L.map('map').setView([51.505, -0.09], 13);
        L.tileLayer('//{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',{
                  description: 'Mapbox Bright',
                  attribution: '&copy; <a href="https://www.mapbox.com/about/maps">Mapbox</a>, '
                                  + '<a href="http://openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        viewer.setupEventHandlers();

    }, // viewer.init

    /**
    * @method viewer.addThumbnails
    */
    addThumbnails: function(){

        var width=0;
        var thumbs=viewer.thumbs=[];
        var html='';

        $.each(viewer.data.views,function(i,view){

          // find associated extrinsics if any
          $.each(viewer.data.extrinsics,function(j,extrinsics){
            if (extrinsics.key==view.key) {
              view.extrinsics=j;
              return false;
            }
          });

          // add thumbnail to html
          html+='<a class="landscape" data-key="'+view.key+'"'+(view.extrinsics?' data-pose="'+view.extrinsics+'">':'>')+'<i></i></a>';

          thumbs.push({
            view: view,
            url: viewer.segmentURL+'/'+view.value.ptr_wrapper.data.filename
          });

        });

        // display thumbnails and set container width
        $(html).appendTo('#thumbnails .content');
        $('#thumbnails .content').width(viewer.data.views.length*(192+8));

    }, // viewer.addThumbnails

    /**
    * @method viewer.loadThumbnails
    *
    * called recursively
    *
    */
    loadThumbnails: function viewer_loadThumbnails(){

      // setup index of thumb to be loaded
      if (viewer.thumbs.current==undefined) {
        // first thumb
        viewer.thumbs.current=0;

      } else {
        // next thumb
        ++viewer.thumbs.current;

        // stop on last thumb
        if (viewer.thumbs.current>=viewer.thumbs.length) {
          viewer.thumbs.current=undefined;
          return;
        }
      }

      // load image as blob (TODO: use a web worker)
      $.ajax({
        dataType: 'native',
        url: viewer.thumbs[viewer.thumbs.current].url,
        xhrFields: {
          responseType: 'blob'
        },
        success: function(blob) {

          var thumb=viewer.thumbs[viewer.thumbs.current];

          // extract exif data (thumbnail could be here)
          loadImage.parseMetaData(blob, function(data) {

              if (data.error) {
                 console.log(data);
                 alert(data.error);
                 return;
              }

              // get GPS coordinates
              try {
                var dms=data.exif.get('GPSLongitude');
                if (dms) {
                  // convert to decimal
                  var lon=thumb.view.lon=parseInt(dms[0])+parseInt(dms[1])/60+parseInt(dms[2])/3600;

                  // set negative value for west coordinate
                  if (data.exif.get('GPSLongitudeRef')=='W') {
                    thumb.view.lon=-Math.abs(lon);
                  }

                }
              } catch(e) {
                console.log(e);
                alert(e.message);
              }

              try {
                var dms=data.exif.get('GPSLatitude');

                if (dms) {
                  // convert to signed decimal
                  var lat=thumb.view.lat=parseInt(dms[0])+parseInt(dms[1])/60+parseInt(dms[2])/3600;

                  // set negative value for south coordinate
                  if (data.exif.get('GPSLatitudeRef')=='S') {
                    thumb.view.lat=-Math.abs(lat);
                  }

                }

              } catch(e) {
                console.log(e);
                alert(e.message);
              }

              if (lon!==undefined && lat!==undefined) {

                // add marker to the map
                thumb.view.marker=L.marker([lat,lon], {
                  title: thumb.view.value.ptr_wrapper.data.filename.replace(/\.[^\.]+$/,'')
                }).addTo(viewer.map);

                // show first marker on the map
                if (viewer.thumbs.current==0) {
                  console.log(lon,lat);
                  viewer.map.setView([lat,lon]);
                }
              }

          }, {
            maxMetaDataSize: 262144

          });

          // resize image
          loadImage(blob,function complete(result){
            if (result.error) {
              console.log(result);
              alert(error);

            } else {
              // display thumbnail
              var canvas=result;
              $('#thumbnails [data-key='+thumb.view.key+'] i').css({
                backgroundImage: 'url('+canvas.toDataURL()+')'
              });

            }

            // load next thumbnail
            setTimeout(viewer.loadThumbnails);

          },{
            maxWidth: 192,
            canvas: true,
            orientation: true
          });

        }
      });

    }, // viewer.loadThumbnails

    /**
    * @method viewer.setupEventHandlers
    */
    setupEventHandlers: function viewer_setupEventHandlers() {

        var _window=$('iframe')[0].contentWindow;

        /**
        * thumbnail click event handler
        */
        $("#thumbnails").on("click","a",function(e) {

          // target pose index
          var pose=this.dataset.pose;

          if (pose!==undefined) {

            // set camera position to extrinsic center
            var camera=_window.camera;
            camera.position.fromArray(viewer.data.extrinsics[pose].value.center);

            // adjust camera up vector
            camera.up.y=-1;

            // set camera rotation matrix
            var rotation=viewer.data.extrinsics[pose].value.rotation;
            var R=new _window.THREE.Matrix3().fromArray(rotation[0].concat(rotation[1]).concat(rotation[2]));

            // compute the camera lookAt vector
            // unit vector
            var lookAt=new _window.THREE.Vector3(0,0,1);
            // apply camera rotation
            lookAt.applyMatrix3(R);
            // translate to camera center
            lookAt.x+=camera.position.x;
            lookAt.y+=camera.position.y;
            lookAt.z+=camera.position.z;

            // copy the lookAt vector to controls targets
            _window.controls.target.copy(lookAt);
            _window.controls.target0.copy(lookAt);

          }

          e.preventDefault();
          e.stopPropagation();
          return false;

        }); // thumbnail click event handler

    } // viewer_setupEventHandlers

} // viewer
