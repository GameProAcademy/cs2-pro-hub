export const R5_FORENSIC_STAGING_BUCKET = "r5-forensic-staging";
export const R5_FORENSIC_SOURCE = "R5_FORENSIC_STAGING";
export const R5_CANONICAL_RELEASE_ID = "cf0549c2-dfbd-c4df-25b4-2ce8204edf87";
export const R5_AUTHORIZED_DEM_FILENAME = "furia-vs-gamerlegion-m1-cache.dem";
export const R5_AUTHORIZED_DEM_SHA256 =
  "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d";
export const R5_AUTHORIZED_DEM_SIZE_BYTES = 473_748_061;
export const R5_STAGING_TTL_HOURS = 24;

export const R5_FORENSIC_STORAGE_PATH =
  `${R5_FORENSIC_STAGING_BUCKET}/${R5_CANONICAL_RELEASE_ID}/${R5_AUTHORIZED_DEM_SHA256}.dem`;