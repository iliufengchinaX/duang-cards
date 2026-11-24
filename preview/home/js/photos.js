export const LAYER = 512;

// Stream thumbs travel in a handful of JPEG atlases. Each photograph is cropped back out and
// stretched into its own 512×512 layer; the curtain shader restores the real aspect, so every
// thread is still PHOTO_W wide and PHOTO_W/aspect tall.
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

// fetch follows a cross-origin redirect (raw.githack.com → raw.githubusercontent.com)
// and createImageBitmap reads the bytes, so a wrong Content-Type does not blank the photo.
async function fetchBlob(src, priority) {
  const res = await fetch(src, priority ? { priority } : undefined);
  if (!res.ok) throw new Error(`Could not load ${src}`);
  return res.blob();
}

// Bytes are fetched in parallel; only one atlas is decoded at a time, so a phone does not
// hold every sheet expanded in memory.
async function decodeBlob(blob) {
  try {
    return { image: await createImageBitmap(blob), release() {} };
  } catch (err) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode a photo atlas')); }; img.src = url; });
    return { image: img, release() { URL.revokeObjectURL(url); } };
  }
}

async function layerOf(atlas, frame) {
  const [x, y, w, h] = frame;
  try {
    return await createImageBitmap(atlas, x, y, w, h, { resizeWidth: LAYER, resizeHeight: LAYER, resizeQuality: 'high' });
  } catch (err) {
    const canvas = document.createElement('canvas');
    canvas.width = LAYER; canvas.height = LAYER;
    canvas.getContext('2d').drawImage(atlas, x, y, w, h, 0, 0, LAYER, LAYER);
    return canvas;
  }
}

function upload(gl, tex, layer, img) {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, LAYER, LAYER, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
  img.close?.();
}

function mip(gl, tex) {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
}

// Atlases download together. The one holding the threads nearest the opening view is fetched
// first and drawn as soon as it arrives; the rest fill in behind it.
export async function streamTextures(gl, tex, photos, atlases, onProgress) {
  const groups = new Map();
  photos.forEach((p, i) => {
    if (p.atlas == null || !atlases?.[p.atlas]) return;
    if (!groups.has(p.atlas)) groups.set(p.atlas, []);
    groups.get(p.atlas).push(i);
  });
  const order = [...groups.keys()].sort((a, b) => a - b);
  let done = 0;
  const total = Math.max(photos.length, 1);
  const report = () => onProgress(done / total);
  let sinceMip = 0;
  const note = async () => {
    if (++sinceMip < 8) return;
    mip(gl, tex); sinceMip = 0;
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  const blobs = order.map((id, n) => fetchBlob(atlases[id].src, n === 0 ? 'high' : 'low'));
  for (let n = 0; n < order.length; n++) {
    const id = order[n];
    const mark = done;
    let decoded = null;
    try {
      decoded = await decodeBlob(await blobs[n]);
      for (const i of groups.get(id)) {
        const img = await layerOf(decoded.image, photos[i].frame);
        upload(gl, tex, i, img);
        done++; report();
        await note();
      }
    } catch (err) {
      console.warn(err);
      done += groups.get(id).length - (done - mark);
      report();
    } finally {
      decoded?.image.close?.();
      decoded?.release();
    }
    mip(gl, tex); sinceMip = 0;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  mip(gl, tex);
}
