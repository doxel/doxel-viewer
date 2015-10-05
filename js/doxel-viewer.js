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

// override loadImage.getExifThumbnail
loadImage.getExifThumbnail=function(dataview, offset, length) {
  var blob=new Blob([dataview.buffer.slice(offset,offset+length)],{type:'image/jpeg'});
  var URL=window.URL||window.webkitURL;
  return URL.createObjectURL(blob);
}

function getParam(name) {
  var list=window.location.search.substring(1).replace(/=/,'&').split('&');
  var index=list.indexOf(name);
  return (index<0)?undefined:decodeURIComponent(list[index+1]);
}

$(document).ready(function(){

    // read src query parameter
    var src=getParam('src');
    viewer.segmentURL='upload/2015/09/02/14412040/2f4acd908588c2590ee06cb67187c85b/1441204044_000000';
    viewer.segmentURL='upload/2015/08/23/14403273/2f4acd908588c2590ee06cb67187c85b/1440327326_000000';

    // use either the specified src, or document.referrer or predefined segmentURL
    src=src||document.referrer||viewer.segmentURL;
    src=src.replace(/\/[^\/]+.html$/,'');

    // remove hostname when src and window are from the same origin
    if (src.substring(0,window.location.origin.length+1)==window.location.origin+'/') {
      src=src.substring(window.location.origin.length);
    }

    // get window location directory
    var pathname=document.location.pathname.replace(/[^\/]+.html$/,'');

    // override predefined segmentURL with src or referrer
    if (pathname!=src) {
      viewer.segmentURL=src;
    }

    // remove leading window pathname from segment pathname
    // (get the relative path)
    if (viewer.segmentURL.substr(0,pathname.length)==pathname) {
      viewer.segmentURL=viewer.segmentURL.substr(pathname.length);
    }

    // change url in address bar and push history state
    if (window.location.search!='?src='+viewer.segmentURL) {
      History.pushState({
        src: viewer.segmentURL
      },null,'?src='+viewer.segmentURL);
    }

    // load potree viewer
    $('iframe')
    .on('load',function(){
      // warning: load event could be fired only one time per iframe
      viewer.window=this.contentWindow;
      frustums.init(viewer.window);
      viewer.showFirstPose();
    })
    .attr('src',viewer.segmentURL+'/potree');

    // initialize doxel-viewer
    $.ajax({
      url: viewer.segmentURL+'/viewer.json',
      success: function(json) {
        viewer.data=json;
        viewer.init();
      },
      error: function(){
        console.log('could not load pointcloud metadata');
      }
    });

    // resize potree viewer iframe
    $(window).on('resize',function(){
      $('iframe').height(window.innerHeight-$('iframe').offset().top);
    }).resize();

});

/**
* @object viewer
*/
var viewer={
    /**
    * @property viewer.metadata_size
    *
    * default range to search for jpeg metadata
    */
    metadata_size: 50*1024,

    /**
    * @property viewer.posesOnly
    */
    posesOnly: true,

    /**
    * @property viewer.pose
    *
    * last pose displayed
    *
    */
    pose: 0,

    /**
    * @property viewer.mode
    */
    mode: {},

    /**
    * @method viewer.init
    */
    init: function viewer_init() {

        viewer.addThumbnails();
        viewer.getJpegMetadata(viewer.loadThumbnails);

        $('#thumbnails').mCustomScrollbar({
          axis: 'x',
          callbacks: {
            whileScrolling: viewer.whileScrolling
          }
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

          if (view.extrinsics==undefined && viewer.posesOnly) return true;

          // add thumbnail to html
          html+='<a class="landscape" data-key="'+view.key+'"'+(view.extrinsics!==undefined?' data-pose="'+view.extrinsics+'">':'>')+'<i></i></a>';

          thumbs.push({
            view: view,
            url: viewer.segmentURL+'/'+view.value.ptr_wrapper.data.filename,
            metadata_size: view.value.ptr_wrapper.data.metadata_size||viewer.metadata_size
          });

        });

        // display thumbnails and set container width
        var content=$('#thumbnails .content');
        $(html).appendTo(content);
        $('#thumbnails .content').width(content[0].childNodes.length*(192+8));

    }, // viewer.addThumbnails

    /**
    * @method viewer.getJpegMetadata
    */
    getJpegMetadata: function viewer_getJpegMetadata(callback) {

      viewer.getJpegMetadataIndex(function(){
        viewer.jpeg_table=null;

        if (!viewer.jpeg_index) {
          // no index found, download jpeg metadata and thumbnails directly from jpeg files
          callback();
          return;
        }

        // load jpeg metadata array
        $.ajax({
          url: viewer.segmentURL+'/jpeg_metadata.bin',
          dataType: 'native',
          xhrFields: {
            responseType: 'blob',
            onprogress: function(e){
              viewer.jpeg_table=e.target.response;
              if (e.target.response && e.loaded>viewer.jpeg_index[(viewer.thumbs.current||0)+1]) {
                if (!viewer.thumbs.progressEvent) {
                  console.log('loadThumbnails');
                  viewer.thumbs.progressEvent=e;
                  viewer.loadThumbnails();
                }
              }
            }
          },

          success: function(blob) {
            if (blob && (blob instanceof Blob)) {
              viewer.jpeg_table=blob;
              callback();

            } else {
              console.log(arguments);
              console.log ('Error: could not load segment jpeg metadata table');
              callback();
            }

          },

          error: function() {
            console.log(arguments);
            console.log ('Error: server error - could not load segment jpeg metadata table');
            callback();
          }

        });
      });

    }, // viewer.getJpegMetadata

    /**
    * @method viewer.getJpegMetadataIndex
    */
    getJpegMetadataIndex: function viewer_getJpegMetadataIndex(callback) {
      viewer.jpeg_index=null;

      $.ajax({
        url: viewer.segmentURL+'/jpeg_metadata_index.bin',
        dataType: 'native',
        xhrFields: {
          responseType: 'arraybuffer',
        },

        success: function(buffer) {
          if (buffer && (buffer instanceof ArrayBuffer)) {
            viewer.jpeg_index=new Uint32Array(buffer);
            callback();

          } else {
            console.log ('Error: could not load segment jpeg metadata index');
            callback();
          }
        },

        error: function() {
            console.log ('Error: server error: could not load segment jpeg metadata index');
            callback();
        }

      });

    }, // viewer.getJpegMetadataIndex

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
          if (viewer.thumbs.current==viewer.thumbs.length) {
            $('#thumbnails').trigger('load');
          }
          return;
        }
      }

      if (viewer.jpeg_table) {
        var start=viewer.jpeg_index[viewer.thumbs.current];
        var end=viewer.jpeg_index[viewer.thumbs.current+1]||(viewer.jpeg_table.size-1);
        if (!viewer.thumbs.progressEvent || (viewer.thumbs.progressEvent && viewer.thumbs.progressEvent.loaded>=end)) {
          var blob=viewer.jpeg_table.slice(start,end,'image/jpeg');
          viewer.parseMetadata(blob);
        } else {
          --viewer.thumbs.current;
          viewer.thumbs.progressEvent=null;
        }

      } else {
        // fallback to load jpeg headers one per one
        // (TODO: use a web worker)

        if (viewer.jpeg_index) {
          var start=viewer.jpeg_index[viewer.thumbs.current];
          var end=viewer.jpeg_index[viewer.thumbs.current+1];
          var length=end-start;
          if (!isNaN(length)) {
            viewer.thumbs[viewer.thumbs.current].metadata_size=length;
          }
        }

        $.ajax({
          dataType: 'native',
          url: viewer.thumbs[viewer.thumbs.current].url,
          headers: { 'Range' : 'bytes=0-'+viewer.thumbs[viewer.thumbs.current].metadata_size },
          xhrFields: {
            responseType: 'blob'
          },

          success: function(blob) {
            viewer.parseMetadata(blob);
          },

          error: function(){
            console.log(arguments);
            // thumbnail not found, delay next thumbnail
            // TODO: display "no image"
            setTimeout(viewer.loadThumbnails,0);
          }
        });
      }

    }, // viewer.loadThumbnails

    /**
    * @method viewer.parseMetadata
    */
    parseMetadata: function viewer_parseMetadata(blob) {

      var thumb=viewer.thumbs[viewer.thumbs.current];
      var thumbIndex=viewer.thumbs.current;

      // extract exif data (thumbnail could be here)
      loadImage.parseMetaData(blob, function(data) {

          if (data.error) {
             console.log(data);
             console.log(data.error);
             return;
          }

          if (data.exif && data.exif.Thumbnail) {
            $('#thumbnails [data-key='+thumb.view.key+'] i').css({
              backgroundImage: 'url('+data.exif.Thumbnail+')'
            });

            // load next thumbnail
            setTimeout(viewer.loadThumbnails,10);

          } else {
            // no thumbnail in jpeg (should not happend)
            resizeImage();
          }

          // keep exif data handy
          thumb.view.exif=data.exif;

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
            //alert(e.message);
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
            //alert(e.message);
          }

          if (lon!==undefined && lat!==undefined) {

            // add marker to the map
            thumb.view.marker=L.marker([lat,lon], {
              key: thumb.view.key,
              pose: thumb.view.extrinsics,
              title: thumb.view.value.ptr_wrapper.data.filename.replace(/\.[^\.]+$/,''),
              clickable: true
            })
            .addTo(viewer.map)
            .on('click',viewer.marker_onclick);

            // show map on first marker added
            if (!$('#mapwrap').hasClass('visible')) {
              $('#mapwrap').addClass('visible');

              // centered on first marker
              viewer.map.setView([lat,lon]);
            }

          }

      }, {
        maxMetaDataSize: 262144

      });

      function resizeImage() {

        // resize image
        loadImage(viewer.thumbs[thumbIndex].url,function complete(result){
          if (result.error) {
            console.log(result);
            //alert(error);

          } else {
            // display thumbnail
            var canvas=result;
            if (canvas.toDataURL) {
              $('#thumbnails [data-key='+thumb.view.key+'] i').css({
                backgroundImage: 'url('+canvas.toDataURL()+')'
              });
            } else {
              console.log(result);
              //alert('load error: '+viewer.thumbs[thumbIndex].url);
              console.log('load error: '+viewer.thumbs[thumbIndex].url);
            }

          }

          // load next thumbnail
          setTimeout(viewer.loadThumbnails,10);

        },{
          maxWidth: 192,
          canvas: true,
          orientation: true
        });

      } // resizeImage

    }, // viewer.parseMetadata

    /**
    * @method viewer.setupEventHandlers
    */
    setupEventHandlers: function viewer_setupEventHandlers() {
        $('#thumbnails').on('load',viewer.play);

        // thumbnail onclick
        $("#thumbnails").on("click","a", viewer.thumbnail_onclick);

        // on showpose
        $(viewer).on('showpose',function(e,pose,scrolling){

          // store pose details for relative camera motion
          viewer.pose=pose;

          pose=Math.floor(pose);

          // show matching thumbnail
          if (!scrolling) viewer.scrollTo({pose: pose});

          // outline matching thumbnail
          $('#thumbnails a.selected').removeClass('selected');
          $('#thumbnails a[data-pose='+pose+']').addClass('selected');

        });

    }, // viewer_setupEventHandlers

    /**
    * @method viewer.thumbnail_onclick
    */
    thumbnail_onclick: function viewer_thumbnail_onclick(e){

      if (viewer.mode.play) {
        return;
      }

      // target pose index
      var pose=this.dataset.pose;
      if (pose!==undefined) {
        frustums.mesh.visible=false;
        viewer.showPose(pose);

      }

      e.preventDefault();
      e.stopPropagation();
      return false;

    }, // viewer.thumbnail_onclick

    /**
    * @method viewer.showPose
    *
    * Show the specified pose and trigger viewer the 'showpose' event.
    * If the pose specified is not an integer value, camera position and
    * rotation will be interpolated
    *
    * @param {Object} [options]
    * @param {Number} [options.pose] The pose to show, or an intermediate value.
    * @param {Boolean} [options.scrolling] Are we scrolling
    * @param {Function} [options.callback] callback
    *
    */
    showPose: function viewer_showPowse(options){

      if (!(options instanceof Object)) {
        options={pose: options};
      }

      var _window=viewer.window;

      if (!_window || !_window.camera) {
        clearTimeout(viewer.showPoseTimeout);
        viewer.showPoseTimeout=setTimeout(function(){
          viewer.showPose(options);
        },150);
        return;
      }
      var camera=_window.camera;

      var poseIndex=options.pose;
      var scrolling=options.scrolling;

      var pose=viewer.getPoseExtrinsics(poseIndex);

      // toggle relative position/rotation
      var rel;
      var _rel=viewer.getRelativeCameraExtrinsics();
      var relativeExtrinsicsNotNull= !viewer.rel || viewer.rel && (
        Math.abs(_rel.t[0]-viewer.rel.t[0])>1e-6 ||
        Math.abs(_rel.t[1]-viewer.rel.t[1])>1e-6 ||
        Math.abs(_rel.t[2]-viewer.rel.t[2])>1e-6 ||
        Math.abs(_rel.R[0][0]-viewer.rel.R[0][0])>1e-6 ||
        Math.abs(_rel.R[0][1]-viewer.rel.R[0][1])>1e-6 ||
        Math.abs(_rel.R[0][2]-viewer.rel.R[0][2])>1e-6 ||
        Math.abs(_rel.R[1][0]-viewer.rel.R[1][0])>1e-6 ||
        Math.abs(_rel.R[1][1]-viewer.rel.R[1][1])>1e-6 ||
        Math.abs(_rel.R[1][2]-viewer.rel.R[1][2])>1e-6 ||
        Math.abs(_rel.R[2][0]-viewer.rel.R[2][0])>1e-6 ||
        Math.abs(_rel.R[2][1]-viewer.rel.R[2][1])>1e-6 ||
        Math.abs(_rel.R[2][2]-viewer.rel.R[2][2])>1e-6
      );

      if (!viewer.rel && relativeExtrinsicsNotNull) {
        rel=viewer.rel=_rel;
        viewer.rel_active=true;

      } else {
       if (relativeExtrinsicsNotNull && (viewer.rel_active || options.pose!=viewer.pose)) {
         viewer.rel=_rel;
         viewer.rel_active=true;
       }

       if (!viewer.rel || (!viewer.rel_active && options.pose!=viewer.pose) || (viewer.rel_active && options.pose==viewer.pose)) {
          rel={
            t: [0,0,0],
            R: [ [0,0,0], [0,0,0], [0,0,0] ]
          };
          viewer.rel_active=false;

       } else {
          rel=viewer.rel;
          viewer.rel_active=true;
       }
      }

      var dest={
        t: pose.position,
        R: pose.rotation
      }

      viewer.prevPose=poseIndex;

      viewer.goto({
        position: [dest.t[0]+rel.t[0],dest.t[1]+rel.t[1],dest.t[2]+rel.t[2]],
        rotation: [
          [dest.R[0][0]+rel.R[0][0],dest.R[0][1]+rel.R[0][1],dest.R[0][2]+rel.R[0][2]],
          [dest.R[1][0]+rel.R[1][0],dest.R[1][1]+rel.R[1][1],dest.R[1][2]+rel.R[1][2]],
          [dest.R[2][0]+rel.R[2][0],dest.R[2][1]+rel.R[2][1],dest.R[2][2]+rel.R[2][2]]
        ],
        steps: options.steps||10,
        callback: function() {
          $(viewer).trigger('showpose',[poseIndex]);
          if (options.callback) {
            options.callback();
          }
        }
      });

    }, // viewer_showPose

    /**
    * @method viewer.getPoseExtrinsics
    *
    * @param {Number} [pose] the pose number
    * @return {Object} [extrinsics]
    * @return {Array} [extrinsics.position]
    * @return {Array} [extrinsics.rotation]
    */
    getPoseExtrinsics: function viewer_getPoseExtrinsics(pose){
      var pose0={
        index: Math.floor(pose)
      };
      var frac=pose-pose0.index;

      // get pose extrinsics
      if (viewer.data.extrinsics.length<=pose0.index) return;
      pose0.extrinsics=viewer.data.extrinsics[pose0.index].value;
      
      if (frac && pose0.index+1<viewer.data.extrinsics.length) {
        // interpolate inter-pose camera position/rotation
        var pose1={
          index: pose0.index+1
        }
        pose1.extrinsics=viewer.data.extrinsics[pose1.index].value;
        pose1.center=pose1.extrinsics.center;
        pose1.right=pose1.extrinsics.rotation[0];
        pose1.up=pose1.extrinsics.rotation[1];
        pose1.out=pose1.extrinsics.rotation[2];

        pose0.center=pose0.extrinsics.center;
        pose0.right=pose0.extrinsics.rotation[0];
        pose0.up=pose0.extrinsics.rotation[1];
        pose0.out=pose0.extrinsics.rotation[2];

        return {
          position: [
            pose0.center[0]+(pose1.center[0]-pose0.center[0])*frac,
            pose0.center[1]+(pose1.center[1]-pose0.center[1])*frac,
            pose0.center[2]+(pose1.center[2]-pose0.center[2])*frac,
          ],
          rotation: [
            [
              pose0.right[0]+(pose1.right[0]-pose0.right[0])*frac,
              pose0.right[1]+(pose1.right[1]-pose0.right[1])*frac,
              pose0.right[2]+(pose1.right[2]-pose0.right[2])*frac
            ],
            [
              -(pose0.up[0]+(pose1.up[0]-pose0.up[0])*frac),
              -(pose0.up[1]+(pose1.up[1]-pose0.up[1])*frac),
              -(pose0.up[2]+(pose1.up[2]-pose0.up[2])*frac)
            ],
            [
              pose0.out[0]+(pose1.out[0]-pose0.out[0])*frac,
              pose0.out[1]+(pose1.out[1]-pose0.out[1])*frac,
              pose0.out[2]+(pose1.out[2]-pose0.out[2])*frac
            ]
          ]

        }

      }

      pose0.up=pose0.extrinsics.rotation[1];

      return {
        position: pose0.extrinsics.center,
        rotation: [
          pose0.extrinsics.rotation[0],
          [ -pose0.up[0], -pose0.up[1], -pose0.up[2] ],
          pose0.extrinsics.rotation[2]
        ]
      }

    }, // viewer.getPoseExtrinsics

    /**
    * @method viewer.getCameraPosition
    *
    * @return {Array} position
    */
    getCameraPosition: function viewer_getCameraPosition(){
      var pos=viewer.window.camera.position;
      return [
        pos.x,
        pos.y,
        pos.z
      ];

    }, // viewer.getCameraPosition

    /**
    * @method viewer.getCameraRotation
    *
    * @return {Array} rotation matrix
    */
    getCameraRotation: function viewer_getCameraRotation(){
      var R=new viewer.window.THREE.Matrix4().makeRotationFromQuaternion(viewer.window.camera.quaternion);
      var re=R.elements;
      return [
          [ re[0], re[1], re[2] ],
          [ re[4], re[5], re[6] ],
          [ -re[8], -re[9], -re[10] ]
      ];

    }, // viewer.getCameraRotation

    /**
    * @method viewer.getRelativeCameraExtrinsics
    *
    * Camera position and rotation relative to viewer.pose
    *
    * @return {Array} position
    */
    getRelativeCameraExtrinsics: function viewer_getRelativeCameraExtrinsics() {

      // camera extrinsics
      var Rc=viewer.getCameraRotation();
      var pc=viewer.window.camera.position;

      // pose extrinsics
      var extrinsics=viewer.getPoseExtrinsics(viewer.pose);
      var Rp=extrinsics.rotation;
      var pp=extrinsics.position;

      // camera position and rotation relative to viewer.pose
      return {
        t: [
          pc.x-pp[0],
          pc.y-pp[1],
          pc.z-pp[2]
        ],
        R: [
          [ Rc[0][0]-Rp[0][0], Rc[0][0]-Rp[0][1], Rc[0][2]-Rp[0][2] ],
          [ Rc[1][0]-Rp[1][0], Rc[1][1]-Rp[1][1], Rc[1][2]-Rp[1][2] ],
          [ Rc[2][0]-Rp[2][0], Rc[2][1]-Rp[2][1], Rc[2][2]-Rp[2][2] ]
        ]
      };

    }, // viewer.getRelativeCameraExtrinsics

    /**
    * @method viewer.goto
    *
    * Move and rotate the camera as specified
    *
    * @param {Array} [options.position]  destination position
    * @param {Array} [options.rotation]  destination rotation
    * @param {Number} [options.steps] number of steps
    * @param {Function} [options.callback]
    */
    goto: function viewer_goto(options) {
      var _window=viewer.window;

      if (!_window || !_window.camera) {
        clearTimeout(viewer.gotoTimeout);
        viewer.gotoTimeout=setTimeout(function(){
          viewer.goto(options);
        },150);
        return;
      }

      var camera=_window.camera;
      var THREE=_window.THREE;

      if (viewer.mode.goto) {
        return;
      }

      var incr=1/options.steps;
      var frac=0;

      var position=[
        viewer.getCameraPosition(),
        options.position
      ];

      var rotation=[
        viewer.getCameraRotation(),
        options.rotation
      ];

      function moveCamera() {

        if (!viewer.mode.goto) {
          return;
        }

        frac+=incr;

        if (frac>1) {
          frac=1;

        } else {
          requestAnimationFrame(moveCamera)

        }

        viewer.moveCamera({
          position: position,
          rotation: rotation,
          frac: frac,
          callback: function() {
            if (frac==1) {
              viewer.mode.goto=false;
              if (options.callback) {
                options.callback();
              }
            }
          }
        });

      }

      viewer.mode.goto=true;
      moveCamera();

    }, // viewer.goto

    /**
    * @method viewer.moveCamera
    *
    * Move and rotate the camera to the specified position/rotation
    *
    * @param {Object} [options]
    * @param {Array} [options.position]  source (optional) and destination positions
    * @param {Array} [options.rotation]  source (optional) and destination rotations
    * @param {Number} [options.frac] position along the path, when source Rt specified
    * @param {Function} [options.callback]
    */
    moveCamera: function viewer_moveCamera(options){

      var _window=viewer.window;

      if (!_window || !_window.camera) {
        clearTimeout(viewer.moveCameraTimeout);
        viewer.moveCameraTimeout=setTimeout(function(){
          viewer.moveCamera(options);
        },150);
        return;
      }

      var camera=_window.camera;
      var THREE=_window.THREE;

      if (options.position.length==2) {

        var frac=options.frac;

        var pose0={
          center: options.position[0],
          up: options.rotation[0][1],
          out: options.rotation[0][2]
        };

        var pose1={
          center: options.position[1],
          up: options.rotation[1][1],
          out: options.rotation[1][2]
        };

        // adjust scene camera up vector
        camera.up.set(
          pose0.up[0]+(pose1.up[0]-pose0.up[0])*frac,
          pose0.up[1]+(pose1.up[1]-pose0.up[1])*frac,
          pose0.up[2]+(pose1.up[2]-pose0.up[2])*frac
        );

        // adjust camera lookAt vector
        var lookAt=new THREE.Vector3(
          pose0.out[0]+(pose1.out[0]-pose0.out[0])*frac,
          pose0.out[1]+(pose1.out[1]-pose0.out[1])*frac,
          pose0.out[2]+(pose1.out[2]-pose0.out[2])*frac
        );

        // adjust camera position
        camera.position.set(
          pose0.center[0]+(pose1.center[0]-pose0.center[0])*frac,
          pose0.center[1]+(pose1.center[1]-pose0.center[1])*frac,
          pose0.center[2]+(pose1.center[2]-pose0.center[2])*frac
        );

      } else {

        var pose0= {
          center: options.position,
          up: options.rotation[1],
          out: options.rotation[2]
        };

        // set camera lookAt vector direction
        lookAt=new THREE.Vector3(
          pose0.out[0],
          pose0.out[1],
          pose0.out[2]
        );

        // set camera up vector
        camera.up.set(
          pose0.up[0],
          pose0.up[1],
          pose0.up[2]
        );

        // set camera position
        camera.position.x=pose0.center[0];
        camera.position.y=pose0.center[1];
        camera.position.z=pose0.center[2];

      }

      // translate lookAt vector to camera position
      lookAt.x+=camera.position.x;
      lookAt.y+=camera.position.y;
      lookAt.z+=camera.position.z;

      if (_window.controls.target) {
        // copy the lookAt vector to orbit controls targets
        _window.controls.target.copy(lookAt);

      } else {
        // set the camera lookAt vector
        camera.lookAt(lookAt);
      }

      if (options.callback) {
        options.callback();
      }

    }, // viewer_moveCamera

    /**
    * @method viewer.scrollTo
    *
    * mCustomScrollbar immediate scrollto
    */
    scrollTo: function viewer_scrollTo(options){
      var a;

      if (options.pose!==undefined) {
        a=$('#thumbnails a[data-pose='+options.pose+']');

      } else if (options.view!==undefined) {
        a=$('#thumbnails a[data-view='+options.view+']');
      }

      if (!a) return;

      // compute mCustomScrollbar dragger and content position
      var t=$('#thumbnails');
      t.mCustomScrollbar('stop');
      var mCSBcontainer=t.find('#mCSB_1_container');
      var dragger=t.find('#mCSB_1_dragger_horizontal');
      var draggerMax=parseInt(dragger.css('max-width'));
      var scrollLength=mCSBcontainer.width();
      var thumbPos=a.position().left;
      var visibleWidth=$('#thumbnails').width();
      var scrollPos=Math.max(Math.min(thumbPos-visibleWidth/2+a.width()/2,scrollLength-draggerMax),0);

      // update mCustomScrollbar content position
      mCSBcontainer.css('left',-scrollPos);

      // update mCustomScrollbar dragger position
      dragger.css('left',scrollPos/scrollLength*draggerMax);

    }, // viewer_scrollTo

    /**
    * @method viewer.marker_onclick
    */
    marker_onclick: function viewer_marker_onclick(e){
      var marker=this;
      if (marker.options.pose) {
        viewer.showPose({
          pose: marker.options.pose
        });
      }
    }, // viewer.marker_onclick

    /**
    * @method viewer.showFirstPose
    */
    showFirstPose: function viewer_showFirstPose() {
      var a=$('#thumbnails a[data-pose]:first');
      if (a.length) {
        viewer.showPose({
          pose: a.data('pose'),
          callback: function() {
            if (viewer.window.controls.target0) {
              viewer.window.controls.target0.copy(viewer.window.controls.target);
            }
            if (viewer.window.controls.position) {
              viewer.window.controls.position.copy(viewer.window.camera.position);
            }
          }
        });
      }
    }, // viewer.showFirstPose

    /**
    * @method viewer.play
    */
    play: function viewer_play() {
      var i=0;
      var incr;
      var _window=viewer.window;

      if (!_window || !_window.camera) {
        clearTimeout(viewer.playTimeout);
        viewer.playTimeout=setTimeout(function(){
          viewer.play();
        },150);
        return;
      }

      function showNextPose() {

        if (!viewer.mode.play) {
          $(viewer).trigger('stop');
          return;
        }

        requestAnimationFrame(showNextPose);

        i+=0.1;

        if (i+1>viewer.data.extrinsics.length) {
          i=viewer.data.extrinsics.length-1;
        }

        viewer.moveCamera(viewer.getPoseExtrinsics(i.toFixed(1)));
        $(viewer).trigger('showpose',[i]);

        // on last frame
        if (i+1==viewer.data.extrinsics.length) {
          // loop
          if (viewer.mode.loop) {
            i=0;
          } else {
            // or stop
            viewer.mode.play=false;
          }
        }
      }

      viewer.mode.play=true;
      viewer.mode.goto=false;
      showNextPose();

    }, // viewer.play

    /**
    * @method viewer.whileScrolling
    */
    whileScrolling: function viewer_whileScrolling() {
      var pose=(viewer.data.extrinsics.length-1)*this.mcs.leftPct/100;
      var dest=viewer.getPoseExtrinsics(pose);
      dest.t=dest.position;
      dest.R=dest.rotation;
      var rel=viewer.getRelativeCameraExtrinsics();
      viewer.moveCamera({
        position: [dest.t[0]+rel.t[0],dest.t[1]+rel.t[1],dest.t[2]+rel.t[2]],
        rotation: [
          [dest.R[0][0]+rel.R[0][0],dest.R[0][1]+rel.R[0][1],dest.R[0][2]+rel.R[0][2]],
          [dest.R[1][0]+rel.R[1][0],dest.R[1][1]+rel.R[1][1],dest.R[1][2]+rel.R[1][2]],
          [dest.R[2][0]+rel.R[2][0],dest.R[2][1]+rel.R[2][1],dest.R[2][2]+rel.R[2][2]]
        ]
      });
      $(viewer).trigger('showpose', [pose,true]);
    }
} // viewer


/**
* @object frustums
*/
var frustums={

    /**
    * @property frustums.url
    */
    url: 'frustums.ply',

    /**
    * @property frustums.color
    */
    color: 0xffff00,

    /**
    * @property frustums.initialPose
    */
    initialPose: 0,

    /**
    * @method frustums.init
    */
    init: function frustums_init(window) {

      frustums.window=window;

      frustums.load(function(ply){
        frustums.parse_ply(window,ply);
        frustums.addToScene();
      });

      frustums.setupEventHandlers();

    }, //  frustums.init

    /**
    * @method frustums.setupEventHandlers
    */
    setupEventHandlers: function frustums_setupEventHandlers(){

      $(viewer).on('showpose',function(e,pose,scrolling){
        if (!frustums.mesh) {
          frustums.initialPose=pose;

        } else {
          pose=Number(pose).toFixed(6);
          frustums.mesh.visible=(pose-Math.floor(pose)==0) && !viewer.mode.play && !viewer.mode.scrolling;
          frustums.mesh.geometry.drawcalls[0].start=pose*18;

        }
      });

    }, // frustums.setupEventHandlers

    /**
    * @method frustums.load
    */
    load: function frustums_load(callback) {
      $.ajax({
        url: viewer.segmentURL+'/'+frustums.url,
        dataType: 'text',
        success: callback,
        error: function() {
          console.log('Could not load '+frustums.url);
        }
      });

    }, // frustums.load

    /**
    * @method frustums.addToScene
    */
    addToScene: function frustums_addToScene() {
      var window=frustums.window;
      var THREE=window.THREE;

      // init geometry
      var geometry=new THREE.BufferGeometry();
      geometry.addAttribute('position', new THREE.BufferAttribute(frustums.position,3));
      geometry.addAttribute('index', new THREE.BufferAttribute(frustums.index,3));

      geometry.addDrawCall(frustums.initialPose*18,18,0);

      // init material
      var material=new THREE.MeshBasicMaterial({
        color: frustums.color,
        wireframe: true,
        depthTest: false,
        depthWrite: false
      });

      // init mesh
      frustums.mesh=new THREE.Mesh(geometry,material);

      window.scene.add(frustums.mesh);

    }, // frustums.addToScene

    /**
    * @method frustums.parse_ply
    */
    parse_ply: function frustums_parse_ply(w,ply) {

      ply=ply.replace(/ +/g,' ').replace(/\n /g,'\n').split('\n');

      // validate ply header
      if (ply.length<14) throw "Parse error";
      ply[2]=ply[2].split('element vertex');

      if (ply[0]!='ply') throw "Parse error";
      if (ply[1]!='format ascii 1.0') throw "Parse error";
      if (ply[2][0]!="" || !Number(ply[2][1])) throw "Parse error";
      if (ply[8]!='end_header') throw "Parse error";

      // extract vertex count
      var vertex_count=frustums.vertex_count=Number(ply[2][1]);

      // allocate storage for position attribute
      var position=frustums.position=new w.Float32Array(vertex_count*3);

      // extract vertex positions
      var id=0;
      var offset=9;
      for (var i=0; i<vertex_count; ++i) {
        var xyz=ply[offset+i].split(' ');
        if (xyz.length>3) throw "Parse error";
        position[id++]=xyz[0];
        position[id++]=xyz[1];
        position[id++]=xyz[2];
      }
      offset+=vertex_count;
      console.log(id,vertex_count*3);

      // allocate storage for index attribute
      var index=frustums.index=new w.Uint16Array(frustums.vertex_count*3+(frustums.vertex_count/5)*3);
      id=0;

      // extract mesh indexes
      for (var i=0; i<vertex_count; ++i) {

        var list=ply[offset+i].split(' ');
        var count=list[0];

        if (count==3) {
          index[id++]=list[1];
          index[id++]=list[2];
          index[id++]=list[3];

        } else if (count==4) {
          index[id++]=list[1];
          index[id++]=list[2];
          index[id++]=list[3];
          index[id++]=list[2];
          index[id++]=list[4];
          index[id++]=list[3];

        } else {
          throw "Parse error";
        }
      }

      console.log(id,vertex_count*3+(vertex_count/5)*3);

    } // frustums.parse_ply

}

