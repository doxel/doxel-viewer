/*
 * doxel-viewer.js
 *
 * Copyright (c) 2015-2016 ALSENET SA - http://doxel.org
 * Please read <http://doxel.org/license> for more information.
 *
 * Author(s):
 *
 *      Luc Deschenaux <rurik.bugdanov@alsenet.com>
 *      Rurik Bogdanov <luc.deschenaux@freesurf.ch>
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
  var list=window.location.search.substring(1).replace(/=/g,'&').split('&');
  var index=list.indexOf(name);
  return (index<0)?undefined:decodeURIComponent(list[index+1]);
}

  $(document).ready(function(){

    // read src query parameter
    var src=getParam('src');

    // use either the specified src, or document.referrer or predefined segmentURL (in js/config.js)
    src=src||document.referrer||viewer.segmentURL;
    src=src.replace(/\/[^\/]+.html$/,'');

    // remove hostname when src and window are from the same origin
    if (src.substring(0,window.location.origin.length+1)==window.location.origin+'/') {
      src=src.substring(window.location.origin.length);
    }

    var pathname=document.location.pathname.split('/');
    if (pathname[1]=='api' && pathname[2]=='segments' && pathname[3]=='viewer') {
      // when viewer is instantiated through doxel-strongloop api, exract segmentUrl from pathname
      var segmentId=pathname[4];
      var timestamp=pathname[5];
      viewer.segmentURL='/api/segments/viewer/'+segmentId+'/'+timestamp;

    } else {
      // replace in two steps for backward directory naming compatibility
      src=src.replace(/\/viewer\/?$/,'');

      // get window location directory
      var pathname=document.location.pathname.replace(/[^\/]+.html$/,'');
      // replace in two steps for backward directory naming compatibility
      pathname=pathname.replace(/\/viewer\/?$/,'');

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
    }

    // load potree viewer
    $('iframe')
    .on('load',iframe.onload)
    .attr('src',viewer.segmentURL+'/potree/potree.html');

    // initialize doxel-viewer
    $.ajax({
      url: viewer.segmentURL+'/viewer/viewer.json',
      success: function(json) {
        viewer.data=json;
        viewer.init();
      },
      error: function(err){
        console.log('could not load pointcloud metadata',err);
        alert(err.statusText || 'Could not load pointcloud');
      }
    });

    // resize potree viewer iframe
    $(window).on('resize',function(){
      $('iframe').height(window.innerHeight-$('iframe').offset().top);
    }).resize();

});

/**
* @object viewer
*
* @event {load} Thumbnails have been loaded
* @event {showpose} Pose has been displayed
*   @param poseIndex
*   @param whileScrolling
* @event {stop} Play mode has been stopped
*
*/
var viewer={
    /**
    * @property viewer.container
    */
    container: 'body',

    /**
    * @property viewer.segmentURL
    *
    * default segment URL (can be set in js/config.js)
    */
  //  segmentURL: 'upload/2015/11/25/14484684/dda90fe50f4d06cbc627799a2ec907da/1448468454_000000',

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
    * @property viewer.autoPlay
    */
    autoPlay: false,

    /**
    * @property viewer.pose
    *
    * last pose displayed
    *
    */
    pose: 0,

    /**
    * @property viewer.zorel
    *
    * zero relative coordinates
    *
    */
    zorel: {
      t: [0,0,0],
      R: [ [0,0,0], [0,0,0], [0,0,0] ]
    },

    /**
    * @property viewer.mode
    */
    mode: {},

    /**
    * @method viewer.init
    */
    init: function viewer_init() {

        viewer.rel=viewer.zorel;
        viewer.addThumbnails();
        viewer.getJpegMetadata(viewer.loadThumbnails);

        $('#thumbnails').mCustomScrollbar({
          axis: 'x',
          callbacks: {
            whileScrolling: viewer.whileScrolling,
            onScroll: viewer.onScroll
          }
        });

        // init map
        var map = viewer.map = L.map('map').setView([51.505, -0.09], 13);
        var blueMarble=L.tileLayer('/blue-marble/{z}/{x}/{y}.png',{
          attribution: '<a href="http://visibleearth.nasa.gov/">NASA</a>',
          tilesize: 256,
          tms: true,
          maxZoom: 8
        }).addTo(map);

        var toner = L.tileLayer('/stamen/toner/{z}/{x}/{y}.png', {
          attribution: '<a href="https://www.stamen.com">Stamen Design</a>',
          opacity: 0.2,
          maxZoom: 8

        });
        toner.addTo(map);

        var osm=L.tileLayer('/osm/{z}/{x}/{y}.png',{
              attribution: '<a href="https://www.openstreetmap.org/copyright">OSM</a>',
             subdomains: ['a','b','c'],
             opacity: 1,
             minZoom: 8
        });
        osm.addTo(map);

/*
        var prevZoom;
        setInterval(function(){
          var newZoom=map.getZoom();
          if (newZoom!=prevZoom) {
            prevZoom=newZoom;
            osm.setOpacity(newZoom<8?0:Math.min(1,Math.max((newZoom-8)/4,0.2)));
            toner.setOpacity(newZoom>8?0:0.2);
            blueMarble.setOpacity(newZoom>9?0:1);
          }
        },300);
*/
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
            url: viewer.segmentURL+'/original_images/'+view.value.ptr_wrapper.data.filename,
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
          url: viewer.segmentURL+'/viewer/jpeg_metadata.bin',
          dataType: 'native',
          xhrFields: {
            responseType: 'blob',
            onprogress: function(e){
              return;
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
        url: viewer.segmentURL+'/viewer/jpeg_metadata_index.bin',
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
             setTimeout(viewer.loadThumbnails,10);
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

        if (viewer.autoPlay) {
          $('#thumbnails').on('load',function(){
            frustums.hide();
            viewer.play();
          });
        }

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
        frustums.hide();
        viewer.showPose({
          pose: pose,
          callback: function(){
            viewer._pose=pose;
            if (!viewer.rel_active) {
              frustums.showImage(pose);
            }
            if (viewer.window.viewer.controls.target) {
              var p=viewer.getPoseExtrinsics(pose);
              viewer.window.viewer.controls.center=new viewer.window.THREE.Vector3(
                p.position[0],
                p.position[1],
                p.position[2]
              );
            }
          }
        });

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
      var camera=_window.viewer.scene.camera;

      var poseIndex=options.pose;
      var scrolling=options.scrolling;

      var pose=viewer.getPoseExtrinsics(poseIndex);
      var dest={
        t: pose.position,
        R: pose.rotation
      }

      var cam;
      if (viewer.mode.showFirstPose) {

        // Disable camera relative positionning for first pose displayed
        // because the pose coordinates system is generally not aligned
        // with the world and the inital webgl camera vertical axis.
        cam={
          position: dest.t,
          rotation: dest.R
        }

      } else {
        var rel=viewer.relativeCameraCoordinates(poseIndex);
        cam=viewer.applyRelativeCameraSettings(dest,rel);

      }

      viewer.goto({
        position: cam.position,
        rotation: cam.rotation,
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
    * @method viewer.relativeCameraCoordinates
    *
    * Save/Load/Toggle/Return relative camera coordinates
    *
    * The viewer only know which pose should be displayed right now,
    * the camera is moved by the potree viewer controls.
    *
    * Then the difference between the target pose position/rotation and
    * the camera position/rotation, if any, is the relative t/R
    * returned by getRelativeCameraExtrinsics() that will be used
    * by applyCameraRelativeSettings() to update the camera
    * position/rotation for the target pose...
    *
    * @param {Number} [pose] Used to toggle back to original coordinates
    * @return {Object} [rel] The relative camera coordinates
    */
    relativeCameraCoordinates: function viewer_relativeCameraCoordinates(pose) {

      var result=viewer.zorel;

      if (viewer._lockRelativeCameraExtrinsics) {
        // dont update relative camera Rt when entering play mode from
        // the last pose (and jumping to the first pose)
        viewer._lockRelativeCameraExtrinsics=false;
        if (viewer.rel_active) {
          return viewer._rel;
        }

      } else {

      var _rel=viewer.getRelativeCameraExtrinsics();
      var poseChanged=(viewer.pose!=pose);

      var _relNotNull=_rel &&  (
        Math.abs(_rel.t[0])>1e-5 ||
        Math.abs(_rel.t[1])>1e-5 ||
        Math.abs(_rel.t[2])>1e-5 ||
        Math.abs(_rel.R[0][0])>1e-5 ||
        Math.abs(_rel.R[0][1])>1e-5 ||
        Math.abs(_rel.R[0][2])>1e-5 ||
        Math.abs(_rel.R[1][0])>1e-5 ||
        Math.abs(_rel.R[1][1])>1e-5 ||
        Math.abs(_rel.R[1][2])>1e-5 ||
        Math.abs(_rel.R[2][0])>1e-5 ||
        Math.abs(_rel.R[2][1])>1e-5 ||
        Math.abs(_rel.R[2][2])>1e-5
      );

      if (_relNotNull) {

        // check whether _rel and viewer.rel are different
        var _relChanged=!viewer.rel || (
          Math.abs(_rel.t[0]-viewer.rel.t[0])>1e-5 ||
          Math.abs(_rel.t[1]-viewer.rel.t[1])>1e-5 ||
          Math.abs(_rel.t[2]-viewer.rel.t[2])>1e-5 ||
          Math.abs(_rel.R[0][0]-viewer.rel.R[0][0])>1e-5 ||
          Math.abs(_rel.R[0][1]-viewer.rel.R[0][1])>1e-5 ||
          Math.abs(_rel.R[0][2]-viewer.rel.R[0][2])>1e-5 ||
          Math.abs(_rel.R[1][0]-viewer.rel.R[1][0])>1e-5 ||
          Math.abs(_rel.R[1][1]-viewer.rel.R[1][1])>1e-5 ||
          Math.abs(_rel.R[1][2]-viewer.rel.R[1][2])>1e-5 ||
          Math.abs(_rel.R[2][0]-viewer.rel.R[2][0])>1e-5 ||
          Math.abs(_rel.R[2][1]-viewer.rel.R[2][1])>1e-5 ||
          Math.abs(_rel.R[2][2]-viewer.rel.R[2][2])>1e-5
        );

        if (_relChanged) {
          // save and activate camera relative coordinates
          viewer.rel=_rel;
          viewer.rel_active=true;
        }
      }

      }

      if (poseChanged) {
        if (viewer.rel && viewer.rel_active) {
          // load and activate saved camera realtive coordinates
          result=viewer.rel;
        }

      } else {
        if (!viewer.rel || !viewer.rel_active) {
          // load and activate saved camera realtive coordinates
          result=viewer.rel;
        }

      }

      viewer.rel_active=(result!=viewer.zorel);

      return result;

    }, // viewer.relativeCameraCoordinates

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
      var pos=viewer.window.viewer.scene.camera.position;
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
      var R=new viewer.window.THREE.Matrix4().makeRotationFromQuaternion(viewer.window.viewer.scene.camera.quaternion);
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
      var pc=viewer.window.viewer.scene.camera.position;

      // pose extrinsics
      var extrinsics=viewer.getPoseExtrinsics(viewer.pose);
      var Rp=extrinsics.rotation;
      var pp=extrinsics.position;

      // camera position relative to pose position, in world coordinates
      var wcx=pc.x-pp[0];
      var wcy=pc.y-pp[1];
      var wcz=pc.z-pp[2];

      var poseR00=Rp[0][0];
      var poseR01=Rp[0][1];
      var poseR02=Rp[0][2];
      var poseR10=Rp[1][0];
      var poseR11=Rp[1][1];
      var poseR12=Rp[1][2];
      var poseR20=Rp[2][0];
      var poseR21=Rp[2][1];
      var poseR22=Rp[2][2];

      // camera rotation relative to pose rotation, in world coordinates
      var wcR00=Rc[0][0]-poseR00;
      var wcR01=Rc[0][1]-poseR01;
      var wcR02=Rc[0][2]-poseR02;
      var wcR10=Rc[1][0]-poseR10;
      var wcR11=Rc[1][1]-poseR11;
      var wcR12=Rc[1][2]-poseR12;
      var wcR20=Rc[2][0]-poseR20;
      var wcR21=Rc[2][1]-poseR21;
      var wcR22=Rc[2][2]-poseR22;

      return {
        // camera position relative to pose position, in pose coordinates space
        t: [
          wcx*poseR00+wcy*poseR01+wcz*poseR02,
          wcx*poseR10+wcy*poseR11+wcz*poseR12,
          wcx*poseR20+wcy*poseR21+wcz*poseR22
        ],
        R: [
            // camera rotation in the pose coordinates space
            [
              wcR00*poseR00+wcR01*poseR01+wcR02*poseR02,
              wcR00*poseR10+wcR01*poseR11+wcR02*poseR12,
              wcR00*poseR20+wcR01*poseR21+wcR02*poseR22
            ],
            [
              wcR10*poseR00+wcR11*poseR01+wcR12*poseR02,
              wcR10*poseR10+wcR11*poseR11+wcR12*poseR12,
              wcR10*poseR20+wcR11*poseR21+wcR12*poseR22
            ],
            [
              wcR20*poseR00+wcR21*poseR01+wcR22*poseR02,
              wcR20*poseR10+wcR21*poseR11+wcR22*poseR12,
              wcR20*poseR20+wcR21*poseR21+wcR22*poseR22
            ]
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
      var camera=_window.viewer.scene.camera;
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
      var THREE=_window.THREE;
      var camera={
        position: new THREE.Vector3(),
        up: new THREE.Vector3()
      }

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
          (pose0.up[0]+(pose1.up[0]-pose0.up[0])*frac),
          (pose0.up[1]+(pose1.up[1]-pose0.up[1])*frac),
          (pose0.up[2]+(pose1.up[2]-pose0.up[2])*frac)
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

        var pose0={
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

      _window.viewer.scene.view.mode.doxel=true;
      _window.viewer.scene.view.up.copy(camera.up);
      _window.viewer.scene.view.lookAt.copy(lookAt);
      _window.viewer.scene.view.position.copy(camera.position);

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
        viewer.mode.showFirstPose=true;
        viewer.mode.firstPoseShown=false;
        viewer.showPose({
          pose: a.data('pose'),
          steps: 1,
          callback: function() {
            viewer.mode.showFirstPose=false;
            viewer.mode.firstPoseShown=true;
            /*
            if (viewer.window.viewer.controls.target0) {
              viewer.window.viewer.controls.target0.copy(viewer.window.viewer.controls.target);
            }
            if (viewer.window.viewer.controls.position) {
              viewer.window.viewer.scene.position.copy(viewer.window.viewer.scene.camera.position);
            }
            */
            $(viewer).trigger('firstpose');
          }
        });
      }
    }, // viewer.showFirstPose

    /**
    * @method viewer.play
    */
    play: function viewer_play() {
      var i;
      if (viewer.pose!=viewer.data.extrinsics.length-1) {
        i=Number(viewer._pose)||0;
      } else {
        viewer._pose=0;
        viewer._lockRelativeCameraExtrinsics=true;
        i=0;
      }
      var incr;
      var _window=viewer.window;

      if (!_window || !_window.viewer.scene.camera || !viewer.mode.firstPoseShown) {
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

        var poseIndex=i.toFixed(1);
        var pose=viewer.getPoseExtrinsics(poseIndex);

        var rel=viewer.relativeCameraCoordinates();

        if (viewer.rel_active) {
          viewer.moveCamera(viewer.applyRelativeCameraSettings({
            t: pose.position,
            R: pose.rotation
          },rel));

        } else {
          viewer.moveCamera(pose);
        }

        $(viewer).trigger('showpose',[i]);
        viewer._pose=i;

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

      frustums.hide();
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

      if (!viewer.mode.scrolling) {
        // get/update relative coordinates before scrolling
        var rel=viewer.relativeCameraCoordinates();

	      if (frustums.imesh) {
          frustums.imesh.fadeOut();
        }

        viewer.mode.scrolling=true;
      }

      if (viewer.rel_active) {
        dest.t=dest.position;
        dest.R=dest.rotation;
        viewer.moveCamera(viewer.applyRelativeCameraSettings(dest,viewer.rel));

      } else {
        viewer.moveCamera(dest);
      }

      $(viewer).trigger('showpose', [pose,true]);

    }, // viewer.whileScrolling

    /**
    * @method viewer.onScroll
    */
    onScroll: function viewer_onScroll() {
      viewer.mode.scrolling=false;
    }, // viewer.onScroll

    /**
    * @method viewer.applyRelativeCameraSettings
    *
    * Convert transformation vertices to pose coordinates space
    *
    * @param {Object} [dest]
    *   @param {Array} [dest.t]
    *   @param {Array} [dest.R]
    * @param {Object} [rel]
    *   @param {Array} [rel.t]
    *   @param {Array} [rel.R]
    *
    * @return {Object} [Rt]
    *   @return {Array} [Rt.position]
    *   @return {Array} [Rt.rotation]
    */
    applyRelativeCameraSettings: function viewer_applyRelativeCameraSettings(pose,rel) {

      if (!viewer.rel_active) {
        return {
           position: pose.t,
           rotation: pose.R
        }
      }

      var poseR00=pose.R[0][0];
      var poseR01=pose.R[0][1];
      var poseR02=pose.R[0][2];
      var poseR10=pose.R[1][0];
      var poseR11=pose.R[1][1];
      var poseR12=pose.R[1][2];
      var poseR20=pose.R[2][0];
      var poseR21=pose.R[2][1];
      var poseR22=pose.R[2][2];

      var relR00=rel.R[0][0];
      var relR01=rel.R[0][1];
      var relR02=rel.R[0][2];
      var relR10=rel.R[1][0];
      var relR11=rel.R[1][1];
      var relR12=rel.R[1][2];
      var relR20=rel.R[2][0];
      var relR21=rel.R[2][1];
      var relR22=rel.R[2][2];

      var relt0=rel.t[0];
      var relt1=rel.t[1];
      var relt2=rel.t[2];

      return {
        position: [
          pose.t[0]+relt0*poseR00+relt1*poseR10+relt2*poseR20,
          pose.t[1]+relt0*poseR01+relt1*poseR11+relt2*poseR21,
          pose.t[2]+relt0*poseR02+relt1*poseR12+relt2*poseR22
        ],

        rotation: [
          [
            poseR00+relR00*poseR00+relR01*poseR10+relR02*poseR20,
            poseR01+relR00*poseR01+relR01*poseR11+relR02*poseR21,
            poseR02+relR00*poseR02+relR01*poseR12+relR02*poseR22
          ], [
            poseR10+relR10*poseR00+relR11*poseR10+relR12*poseR20,
            poseR11+relR10*poseR01+relR11*poseR11+relR12*poseR21,
            poseR12+relR10*poseR02+relR11*poseR12+relR12*poseR22
          ], [
            poseR20+relR20*poseR00+relR21*poseR10+relR22*poseR20,
            poseR21+relR20*poseR01+relR21*poseR11+relR22*poseR21,
            poseR22+relR20*poseR02+relR21*poseR12+relR22*poseR22
          ]
        ]
      };

    } // viewer.applyRelativeCameraSettings

} // viewer


/**
* @object frustums
*/
var frustums={

    mode: {
      all: false,
      always: false
    },

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
    * @property frustums.fadeInSteps
    */
    fadeInSteps: 1,

    /**
    * @property frustums.fadeOutSteps
    */
    fadeOutSteps: 1,

    /**
    * @method frustums.init
    */
    init: function frustums_init(window) {

      frustums.window=window;

      frustums.load(function(ply){
        try {
          frustums.parse_ply(window,ply);
        } catch(e) {
          console.log(e);
          alert('Could not parse frustums.ply');
        }

        frustums.addToScene();
        frustums.setupEventHandlers();
        $(frustums).trigger('load');
      });


    }, //  frustums.init

    /**
    * @method frustums.setupEventHandlers
    */
    setupEventHandlers: function frustums_setupEventHandlers(){

      // hide frustum image on orbitcontrols move start
      // TODO: the same with other controls (fly and earth)
      viewer.window.viewer.controls.addEventListener('start',function(){
        if (frustums.imesh) frustums.imesh.fadeOut();
      });

      // show frustum on viewer 'showpose' event
      $(viewer).on('showpose',function(e,pose,scrolling){
        if (!frustums.mesh) {
          frustums.initialPose=pose;

        } else {
          pose=Number(pose).toFixed(5);

          if (!frustums.mode.all) {
            frustums.changeTo(pose);
          }

          frustums.mesh.visible= frustums.mode.always || (
            (pose-Math.floor(pose)==0 || frustums.mode.all) &&
            !viewer.mode.play &&
            !viewer.mode.scrolling
          );
        }
      });

      // show frustum image on viewer 'firstpose' event
      $(viewer).on('firstpose',function(e){
        frustums.showImage(viewer.pose);
      });

    }, // frustums.setupEventHandlers

    /**
    * @method frustums.load
    */
    load: function frustums_load(callback) {
      $.ajax({
        url: viewer.segmentURL+'/viewer/'+frustums.url,
        dataType: 'text',
        success: callback,
        error: function() {
          alert('Could not load '+frustums.url);
          window.history.back();
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
      geometry.setIndex(new THREE.BufferAttribute(frustums.index,3));

      // init material
      var material=new THREE.MeshBasicMaterial({
        color: frustums.color,
        wireframe: true,
        depthTest: false,
        depthWrite: false
      });

      // init mesh
      frustums.mesh=new THREE.Mesh(geometry,material);

      if (!frustums.mode.all) {
        frustums.show(frustums.initialPose);
      }

      window.viewer.scene.scene.add(frustums.mesh);

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

    }, // frustums.parse_ply

    /**
    * @method frustums.show
    */
    show: function frustums_show(pose) {
      frustums.mesh.visible=true;

      if (pose!=undefined) {
        // add pose to draw list
        frustums.mesh.geometry.setDrawRange(pose*18,12); // addDrawCall(pose*18,18,0);
      } else {
        // draw all
        frustums.mesh.geometry.setDrawRange(0,frustums.vertex_count);//drawcalls.splice(0,frustums.mesh.geometry.drawcalls.length)
      }
    }, // frustums.show

    /**
    * @method frustums.hide
    */
    hide: function frustums_hide() {
      if (!frustums.mesh) {
        return;
      }
      frustums.mesh.visible=frustums.mode.always;
      if (!frustums.mesh.visible && frustums.imesh) {
        frustums.imesh.fadeOut();
      }
    }, // frustums.hide

    /**
    * @method frustums.changeTo
    */
    changeTo: function frustums_changeTo(pose) {
      frustums.mesh.geometry.setDrawRange(Math.floor(pose)*18,12);
    }, // frustums.changeTo

    /**
    * @method frustums.showImage
    */
    showImage: function frustums_showImage(pose) {

      // same pose, same mesh
      if (frustums.imesh && frustums.imesh.pose==pose) {
        frustums.imesh.fadeIn();
        return;
      }

      // wait for frustums geometry
      if (!frustums.mesh) {
        clearTimeout(frustums.showImage_timeout);
        frustums.showImage_timeout=setTimeout(function(){
          frustums.showImage(pose);
        },150);
        return;
      }

      // create mesh for frustum image
      var THREE=viewer.window.THREE;
      var geometry=new THREE.PlaneBufferGeometry();
      var gp=geometry.attributes.position.array;

      // offset of first vertex index in fp
      var offset=pose*18+12;
      var fp=frustums.mesh.geometry.attributes.position.array;
      var vertex_index=frustums.mesh.geometry.index.array;

      var position_index=vertex_index[offset]*3;
      gp[0]=fp[position_index];
      gp[1]=fp[position_index+1];
      gp[2]=fp[position_index+2];

      position_index=vertex_index[offset+3]*3;
      gp[3]=fp[position_index];
      gp[4]=fp[position_index+1];
      gp[5]=fp[position_index+2];

      position_index=vertex_index[offset+4]*3;
      gp[6]=fp[position_index];
      gp[7]=fp[position_index+1];
      gp[8]=fp[position_index+2];

      position_index=vertex_index[offset+2]*3;
      gp[9]=fp[position_index];
      gp[10]=fp[position_index+1];
      gp[11]=fp[position_index+2];


      var texture=THREE.ImageUtils.loadTexture(
        ((viewer.segmentURL.split('/')[1]=='api')?'':document.location.pathname.replace(/[^\/]+$/,''))+viewer.segmentURL+'/PMVS/visualize/'+(('00000000'+pose).substr(-8))+'.jpg',

        THREE.UVMapping,
        undefined,
        function texture_onerror() {
          console.log(arguments);
          alert('Could not load undistorted pose image');
        }
      );

      texture.minFilter=THREE.LinearFilter

      var material=new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0
      });

      material.needsUpdate=true;

      frustums.imesh=new THREE.Mesh(geometry, material);
      frustums.imesh.pose=pose;

      viewer.window.viewer.scene.fruscene.add(frustums.imesh);

      frustums.imesh.fadeIn=function fadeIn(callback) {
        function _fadeIn() {
          material.opacity+=1/frustums.fadeInSteps;
          if (material.opacity>=1) {
            material.opacity=1;
            if (callback) {
              callback();
            }
            return;
          }
          requestAnimationFrame(_fadeIn);
        }
        _fadeIn();

      } // frustums.imesh.fadeIn

      frustums.imesh.fadeOut=function fadeOut(callback) {
        function _fadeOut() {
          material.opacity-=1/frustums.fadeOutSteps;
          if (material.opacity<=0) {
            material.opacity=0;
            if (callback) {
              callback();
            }
            return;
          }
          requestAnimationFrame(_fadeOut);
        }
        _fadeOut();

      } // frustums.imesh.fadeOut

      frustums.imesh.fadeIn();

    }, // frustums.showImage
/*
    showImage: function frustums_showImage(pose) {
      var THREE=viewer.window.THREE;
      var geometry=new THREE.Geometry();
      var v=new THREE.Vector3();
      var p=frustums.mesh.geometry.attributes.position.array;
      var vertex_index=frustums.mesh.geometry.attributes.index.array;

      // offset of first vertex index in attributes.index.array
      var offset=pose*18+12;
      var c;

      for (var i=0; i<6 ; ++i) {
        var position_index=vertex_index[offset+i]*3;
        console.log(position_index);
        geometry.vertices.push(v.set(p[position_index],p[position_index+1],p[position_index+2]));
        console.log(v);
      }

      geometry.faces.push(new THREE.Face3(0,1,2));
      geometry.faces.push(new THREE.Face3(3,4,5));

      geometry.faceVertexUvs[0]=[
        [
          new THREE.Vector2(0,1),
          new THREE.Vector2(0,0),
          new THREE.Vector2(1,1)
        ],

        [
          new THREE.Vector2(0,0),
          new THREE.Vector2(1,0),
          new THREE.Vector2(1,1)
        ]
      ];

      geometry.verticesNeedUpdate=true;
      geometry.uvsNeedUpdate=true;
      geometry.computeBoundingSphere();
      geometry.computeFaceNormals();
      geometry.computeVertexNormals();

      var texture=THREE.ImageUtils.loadTexture(
        document.location.pathname.replace(/[^\/]+$/,'')+viewer.segmentURL+'/PMVS/visualize/'+(('00000000'+pose).substr(-8))+'.jpg',
        THREE.UVMapping,
        function texture_onload() {
          console.log('texture_onload',arguments);
        },
        function texture_onerror() {
          console.log(arguments);
          alert('Could not load undistorted pose image');
        }
      );
      texture.minFilter=THREE.LinearFilter

      var material=new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
      });

      material.needsUpdate=true;

      frustums.imesh=new THREE.Mesh(geometry, material);


      viewer.window.scene.add(frustums.imesh);

    } // frustums.showImage
*/

} // frustums

/**
* @object iframe
*/
var iframe={

  /**
  * @method iframe.onload
  */
  onload: function iframe_onload(){
    var iframe=this;
    var window=iframe.contentWindow;

    if (!window.viewer || !window.viewer.scene || !window.viewer.scene.camera || !window.viewer.controls) {
      console.log(window);
      clearTimeout(iframe.onload_timeout);
      iframe.onload_timeout=setTimeout(function(){
        iframe_onload.call(iframe);
      },150);
      return;
    }

    viewer.window=window;
    $(frustums).on('load',function(){
      $(viewer.container).removeClass('disabled');
      viewer.showFirstPose();
      $(iframe).removeClass('hidden');
    });
    frustums.init(viewer.window);

  } // iframe.onload

} // iframe
