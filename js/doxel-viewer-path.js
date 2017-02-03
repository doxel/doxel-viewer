/**
 * @constructor CameraPath
 * @param {Object} [options] unused yet
 */
var CameraPath=function(options) {
  if (!this instanceof CameraPath) {
    return new CameraPath(options);
  }
  $.extend(true,this.defaults,this,options);
  if (this.init) {
    this.init();
  }
}

$.extend(true,CameraPath.prototype,{
  waypoints: [],

  add: function cameraPath_add(options){
    var cameraPath=this;
    if (!options) {
      options={}
    }
    if (!options.waypoint) {
      options.waypoint={
        position: viewer.getCameraPosition(),
        rotation: viewer.getCameraRotation()
      }
    }
    cameraPath.push(new Waypoint(options.waypoint));

  }, // cameraPath.add

  play: function cameraPath_play(options){
    if (viewer.mode.play) {
			return;
		}

    var cameraPath=this;
		var i; 

		if (cameraPath.pose!=cameraPath.waypoints.length-1) {
			i=Number(cameraPath._pose)||0;
		} else {
			cameraPath._pose=0;
			viewer._lockRelativeCameraExtrinsics=true;
			i=0;                                                                                                          
		}     

		var incr;
		var _window=viewer.window;
					 
		if (!_window || !_window.camera || !viewer.mode.firstPoseShown) {
			clearTimeout(viewer.playTimeout);
			viewer.playTimeout=setTimeout(function(){
				cameraPath_play(options);
			},150);
			return;
		}      
					 
		function showNextPose() {
					 
			if (!viewer.mode.path) {
				$(viewer).trigger('stop');
				return;
			}    
					 
			requestAnimationFrame(showNextPose);
					 
			i+=1/
					 
			if (i+1>cameraPath.waypoints.length) {
				i=cameraPath.waypoints.length-1;
			}    
					 
			var poseIndex=i.toFixed(1);
			var pose=cameraPath.getPoseExtrinsics(poseIndex);
					 
			var rel=cameraPath.relativeCameraCoordinates();
					 
			if (viewer.rel_active) {
				viewer.moveCamera(viewer.applyRelativeCameraSettings({
					t: pose.position,
					R: pose.rotation
				},rel));
					 
			} else {
				viewer.moveCamera(pose);
			}    
					 
			$(cameraPath).trigger('showpose',[i]);
			cameraPath._pose=i;
					 
			// on last frame
			if (i+1==cameraPath.waypoints.length) {
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
					 
  }, // cameraPath.play

	/**       
	* @method cameraPath.getPoseExtrinsics
	*         
	* @param {Number} [pose] the pose number
	* @return {Object} [extrinsics]
	* @return {Array} [extrinsics.position]
	* @return {Array} [extrinsics.rotation]
	*/        
	getPoseExtrinsics: function cameraPath_getPoseExtrinsics(pose){
 		var cameraPath=this;
		var pose0={
			index: Math.floor(pose)
		};      
		var frac=pose-pose0.index;
						
		// get pose extrinsics
		if (cameraPath.waypoints.length<=pose0.index) return;
		pose0.extrinsics=cameraPath.waypoints[pose0.index];
						
		if (frac && pose0.index+1<cameraPath.waypoints.length) {
			// interpolate inter-pose camera position/rotation
			var pose1={
				index: pose0.index+1
			}     
			pose1.extrinsics=cameraPath.waypoints[pose1.index];
			pose1.center=pose1.extrinsics.position;
			pose1.right=pose1.extrinsics.rotation[0];
			pose1.up=pose1.extrinsics.rotation[1];
			pose1.out=pose1.extrinsics.rotation[2];
						
			pose0.center=pose0.extrinsics.position;
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
						
	}, // cameraPath.getPoseExtrinsics


});

/**
 * @constructor Waypoint
 * @param {Array} [options.position]  destination position
 * @param {Array} [options.rotation]  destination rotation
 * @param {Number} [options.steps] number of steps
 */
var Waypoint=function(options) {
  if (!this instanceof Waypoint) {
    return new Waypoint(options);
  }
  $.extend(true,this,this.defaults,options);
  if (this.init) {
    this.init();
  }
}

$.extend(true,Waypoint.prototype,{
  defaults: {
    position: [0,0,0],
    rotation: [
      1,0,0,
      0,1,0,
      0,0,1 
    ],
    steps: 25
  },
  goto: function(callback){
    var waypoint=this;
    viewer.goto({
      position: waypoint.position,
      rotation: waypoint.rotation,
      steps: waypoints.steps,
      callback: function(){
        $(waypoint).trigger('reach');
        if (callback) {
          callback.call(waypoint);
        }
      });
    });
  }
});
