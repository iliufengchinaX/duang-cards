export const LAYER = 512;

// The texture array is allocated up front and filled in the background, so the curtain can
// start falling at once; photographs only show up close, by which time most have arrived.
export function createPhotoArray(gl, count) {
  const limit = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
  if (count > limit) throw new Error(`This device supports at most ${limit} photos; the catalog has ${count}.`);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1 + Math.log2(LAYER), gl.RGBA8, LAYER, LAYER, count);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

async function bitmap(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not load photo: ${src}`);
  // Stretched to the square layer; the stream restores the aspect.
  return createImageBitmap(await res.blob(), { resizeWidth: LAYER, resizeHeight: LAYER, resizeQuality: 'high' });
}

export async function streamTextures(gl, tex, photos, onProgress) {
  let done = 0, sinceMip = 0;
  const queue = photos.map((_, i) => i);
  const mip = () => { gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); sinceMip = 0; };
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      try {
        const img = await bitmap(photos[i].thumb || photos[i].src);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
        img.close();
      } catch (err) { console.warn(err); }
      if (++sinceMip >= 16) mip();
      onProgress(++done / photos.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  mip();
}
