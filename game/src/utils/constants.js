/**
 * Where the widely used constants go
 */

export const BLOCK_SIZE = 45;
export const PIXEL_SIZE = 5;
export const GRAVITY = 1;


// Wasn't sure where to put these, so I put them here for now. They are used in water.js and main.js
export const WATER_WAVE = {
	freq: 0.018,   
	speed: 0.29,   
	phaseScale: 0, 
	
};
export const WATER_SPRING = {
	spacing: 5,
	tension: 0.022,
	damping: 0.05,
	spread: 0.16,
	spreadPasses: 8,
	splashRadius: 6,
	splashTransfer: 0.16,
	entryDamping: 0.5,
	entryMinImpact: 18,     
	entrySplashScale: 0.5, 
	pressBand: 90,
	weightPush: 6,
	idleAmplitude: 1,
	idleFreq: WATER_WAVE.freq * 3.4,
	idleSpeed: WATER_WAVE.speed * 1.7,
	maxDisplacement: 42,
	tensionBand: 30,
	surfaceTension: 270,
	skimBand: 26,          
	skimLift: 340,         
	skimAccelMul: 0.85,    
	skimSpeedMul: 1.15,    
	maxSwimSpeed: 480, 
};

//splash-triggered light disturbances
export const WATER_LIGHT_BEND = {
	maxActive: 8,
	travelSpeed: 210,
	frontWidth: 44,
	radius: 68,
	freq: 0.055,
	oscSpeed: 6.5,
	decayRate: 0.85,
	lifespan: 2.4,
};
export const BG_RIPPLE = {
	amp: PIXEL_SIZE * 2,
	radius: 460,
	travelSpeed: WATER_LIGHT_BEND.travelSpeed * 1.35,
	frontWidth: WATER_LIGHT_BEND.frontWidth * 2.4,
	freq: WATER_LIGHT_BEND.freq * 0.6,
	oscSpeed: WATER_LIGHT_BEND.oscSpeed,
	decayRate: WATER_LIGHT_BEND.decayRate * 0.7,
};
