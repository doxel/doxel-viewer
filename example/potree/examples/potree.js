var sceneProperties = {
	path: "../resources/pointclouds/potree/cloud.js",
	cameraPosition: null, 		// other options: cameraPosition: [10,10,10],
	cameraTarget: null, 		// other options: cameraTarget: [0,0,0],
	fov: 60, 					// field of view in degrees,
	sizeType: "Fixed",	// other options: "Fixed", "Attenuated"
	quality: null, 			// other options: "Circles", "Interpolation", "Splats"
	material: "RGB", 		// other options: "Height", "Intensity", "Classification"
	pointLimit: 1,				// max number of points in millions
	pointSize: 1,				// 
	navigation: "Orbit",		// other options: "Orbit", "Flight"
	useEDL: false,				
};
sceneProperties.cameraPosition= [ 3.739257525006901, 1.4781061481589732, -1.1556437534554016 ] ;
sceneProperties.cameraTarget= [ 3.0282095156123527, 1.1825485304726668, -0.517634017664759 ] ;
sceneProperties.cameraUp= [ -0.5680919292427002,
  -0.29321532854082333,
  -0.7689579514108714 ] ;
