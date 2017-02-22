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
sceneProperties.cameraPosition= [ -3.5230290787385905, -0.491060480278788, 0.2441247461346665 ] ;
sceneProperties.cameraTarget= [ -3.4930819256421897, -0.4857987445988167, 1.2436623803231224 ] ;
sceneProperties.cameraUp= [ -0.0027813201489790434,
  -0.9999818345930651,
  0.005347405176046927 ] ;
