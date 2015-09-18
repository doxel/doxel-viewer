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
        $('#thumbnails').mCustomScrollbar({
          axis: 'x'
        });


        // init map
        var map = L.map('map').setView([51.505, -0.09], 13);
        L.tileLayer('//{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',{
                  description: 'Mapbox Bright',
                  attribution: '&copy; <a href="https://www.mapbox.com/about/maps">Mapbox</a>, '
                                  + '<a href="http://openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        
        //    viewer.iframe.restore();
        viewer.setupEventHandlers();

    }, // viewer.init

    /**
    * @method viewer.addThumbnails
    */
    addThumbnails: function(){

        var width=0;      

        $.each(viewer.data.views,function(i,view){

          // find associated extrinsics if any
          $.each(viewer.data.extrinsics,function(j,extrinsics){
            if (extrinsics.key==view.key) {
              view.extrinsics=j;
              return false;
            }
          });

          width+=$('<a class="landscape" data-key="'+view.key+'"'+(view.extrinsics?' data-pose="'+view.extrinsics+'">':'>')+'<i style="background-image: url(../'+viewer.segmentURL+'/'+view.value.ptr_wrapper.data.filename+')"></i></a>')
            .appendTo('#thumbnails .content').outerWidth()+8;

//TODO: read exif and resize

        });

        $('#thumbnails .content').width(width);

    }, // viewer.addThumbnails

    /**
    * @method viewer.setupEventHandlers
    */
    setupEventHandlers: function viewer_setupEventHandlers() {

        /**
        * thumbnail click event handler
        */
        $("#thumbnails").on("click","a",function(e) {
          var a=this;

          var _window=$('iframe')[0].contentWindow;
          var camera=_window.camera;

          // target pose index
          var pose=a.dataset.pose;

          if (pose!==undefined) {

            // set camera position
            camera.position.fromArray(viewer.data.extrinsics[pose].value.center);

            // set camera rotation matrix
            var rotation=viewer.data.extrinsics[pose].value.rotation;
            var R=new _window.THREE.Matrix3().fromArray(rotation[0].concat(rotation[1]).concat(rotation[2]));
            camera.rotation.setFromRotationMatrix(R);

            $('iframe')[0].contentWindow.camera.updateMatrixWorld();
          }

          e.preventDefault();
          e.stopPropagation();
          return false;
          
        }); // thumbnail click event handler

    } // viewer_setupEventHandlers

} // viewer


