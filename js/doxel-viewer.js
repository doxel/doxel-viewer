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
      frustums.init(this.contentWindow);
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
        alert('could not load pointcloud metadata');
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
    * @property viewer.mode
    */
    mode: {},

    /**
    * @method viewer.init
    */
    init: function viewer_init() {

        viewer.addThumbnails();
        viewer.loadThumbnails();

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
          $('#thumbnails').trigger('load');
          return;
        }
      }

      // load image as blob (TODO: use a web worker)
      $.ajax({
        dataType: 'native',
        url: viewer.thumbs[viewer.thumbs.current].url,
        headers: { 'Range' : 'bytes=0-'+viewer.thumbs[viewer.thumbs.current].metadata_size },
        xhrFields: {
          responseType: 'blob'
        },
        success: function(blob) {

          var thumb=viewer.thumbs[viewer.thumbs.current];
          var thumbIndex=viewer.thumbs.current;

          // extract exif data (thumbnail could be here)
          loadImage.parseMetaData(blob, function(data) {

              if (data.error) {
                 console.log(data);
                 alert(data.error);
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
                alert(e.message);
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
                alert(error);

              } else {
                // display thumbnail
                var canvas=result;
                $('#thumbnails [data-key='+thumb.view.key+'] i').css({
                  backgroundImage: 'url('+canvas.toDataURL()+')'
                });

              }

              // load next thumbnail
              setTimeout(viewer.loadThumbnails,10);

            },{
              maxWidth: 192,
              canvas: true,
              orientation: true
            });

          } // resizeImage


        },

        error: function(){
          console.log(arguments);
          // thumbnail not found, delay next thumbnail
          // TODO: display "no image"
          setTimeout(viewer.loadThumbnails,0);
        }
      });

    }, // viewer.loadThumbnails

    /**
    * @method viewer.setupEventHandlers
    */
    setupEventHandlers: function viewer_setupEventHandlers() {
        $('#thumbnails').on('load',viewer.play);

        // thumbnail onclick
        $("#thumbnails").on("click","a", viewer.thumbnail_onclick);

        // on showpose
        $(viewer).on('showpose',function(e,pose,scrolling){
          pose=Math.floor(pose);
          if (!scrolling) viewer.scrollTo({pose: pose});
          $('#thumbnails a.selected').removeClass('selected');
          $('#thumbnails a[data-pose='+pose+']').addClass('selected');
        });

    }, // viewer_setupEventHandlers

    /**
    * @method viewer.thumbnail_onclick
    */
    thumbnail_onclick: function viewer_thumbnail_onclick(e){

      // target pose index
      var pose=this.dataset.pose;
      if (pose!==undefined) {
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
    * @param {Number} [poseIndex] The pose to show, or an intermediate value.
    *
    */
    showPose: function viewer_showPowse(poseIndex,scrolling){

      var _window=$('iframe')[0].contentWindow;
      var camera=_window.camera;
      var THREE=_window.THREE;
      var lookAt;

      var pose0={
        index: Math.floor(poseIndex)
      }
      var frac=poseIndex-pose0.index;

      // get pose extrinsics
      pose0.extrinsics=viewer.data.extrinsics[pose0.index];
      if (!pose0.extrinsics) return;

      // get pose camera up vector
      pose0.up=pose0.extrinsics.value.rotation[1];

      // set camera position to extrinsic center
      pose0.center=pose0.extrinsics.value.center;

      // the camera lookAt vector is the third line of the camera rotation matrix
      pose0.out=pose0.extrinsics.value.rotation[2];

      // compute intermediate camera position/rotation
      if (frac && pose0.index+1<viewer.data.extrinsics.length) {
        var pose1={
          index: pose0.index+1
        }
        pose1.extrinsics=viewer.data.extrinsics[pose1.index];
        if (pose1.extrinsics) {

          // get camera up vector for next frame
          pose1.up=pose1.extrinsics.value.rotation[1];

          // adjust scene camera up vector
          camera.up.set(
            -(pose0.up[0]+(pose1.up[0]-pose0.up[0])*frac),
            -(pose0.up[1]+(pose1.up[1]-pose0.up[1])*frac),
            -(pose0.up[2]+(pose1.up[2]-pose0.up[2])*frac)
          );

          // get camera lookAt vector for next frame
          pose1.out=pose1.extrinsics.value.rotation[2];

          // adjust camera lookAt vector
          lookAt=new THREE.Vector3(
            pose0.out[0]+(pose1.out[0]-pose0.out[0])*frac,
            pose0.out[1]+(pose1.out[1]-pose0.out[1])*frac,
            pose0.out[2]+(pose1.out[2]-pose0.out[2])*frac
          );

          // get next camera position
          pose1.center=pose1.extrinsics.value.center;

          // adjust camera position
          camera.position.set(
            pose0.center[0]+(pose1.center[0]-pose0.center[0])*frac,
            pose0.center[1]+(pose1.center[1]-pose0.center[1])*frac,
            pose0.center[2]+(pose1.center[2]-pose0.center[2])*frac
          );
        }

      } else {
        // set camera lookAt vector direction
        lookAt=new THREE.Vector3(pose0.out[0],pose0.out[1],pose0.out[2]);

        // set camera up vector
        camera.up.set(-pose0.up[0],-pose0.up[1],-pose0.up[2]);

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
        _window.controls.target0.copy(lookAt);

      } else {
        // set the camera lookAt vector
        camera.lookAt(lookAt);
      }

      $(viewer).trigger('showpose',[poseIndex,scrolling]);

    }, // viewer_showPose

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
        viewer.showPose(marker.options.pose);
      }
    }, // viewer.marker_onclick

    /**
    * @method viewer.showFirstPose
    */
    showFirstPose: function viewer_showFirstPose() {
      var a=$('#thumbnails a[data-pose]:first');
      if (a.length) {
        viewer.showPose(a.data('pose'));
      }
    }, // viewer.showFirstPose

    /**
    * @method viewer.play
    */
    play: function viewer_play() {
      var i=0;
      var incr;

      function showNextPose() {

        if (!viewer.mode.play) {
          return;
        }

        requestAnimationFrame(showNextPose);

        viewer.showPose(i+=0.1);

        // on last frame
        if (i>=viewer.data.extrinsics.length) {
          // loop
          if (viewer.mode.loop) {
            i=0;
          } else {
            // or stop
            viewer.mode.play=false;
            $(viewer).trigger('stop');
          }
        }
      }

      viewer.mode.play=true;
      showNextPose();

    }, // viewer.play

    /**
    * @method viewer.whileScrolling
    */
    whileScrolling: function viewer_whileScrolling() {
      var poses=$('#thumbnails a[data-pose]');
      viewer.showPose(poses.length*this.mcs.leftPct/100,true);
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
          alert('Could not load '+frustums.url);
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

