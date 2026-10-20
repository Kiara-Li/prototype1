// Look Up · 摄像头：头部角度（pitch / yaw）、眯一只眼、两只手
// 复用：头部角度 ../../shared/head.js；L 形判定、眯眼 ../../frame.js（和旧页面同一份）

import { FaceLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { headAngles } from '../../shared/head.js';
import { classifyHand, isWink } from '../../frame.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const vision = {
  status: 'off',            // off | starting | ready | no-camera | error
  message: '',
  video: null,
  face: null,
  hands: null,
  lastFace: -1,
  lastHands: -1,
  handCount: 0,
  // 最近一次的结果
  faceOk: false,
  pitch: null,
  yaw: null,
  wink: false,
  landmarks: null,
};

async function create(Kind, files, opts) {
  try {
    return await Kind.createFromOptions(files, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
  } catch {
    return Kind.createFromOptions(files, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
  }
}

export async function startVision() {
  vision.status = 'starting';
  vision.message = 'Opening camera…';
  try {
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.className = 'hidden-video';
    document.body.appendChild(video);
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
    });
    await video.play();
    vision.video = video;
  } catch (err) {
    vision.status = 'no-camera';
    vision.message = 'Camera unavailable — use ↑ ↓ and drag a frame.';
    return false;
  }
  try {
    vision.message = 'Loading…';
    const files = await FilesetResolver.forVisionTasks(WASM);
    vision.face = await create(FaceLandmarker, files, {
      baseOptions: { modelAssetPath: FACE }, runningMode: 'VIDEO', numFaces: 1,
      outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true,
    });
    vision.hands = await create(HandLandmarker, files, {
      baseOptions: { modelAssetPath: HAND }, runningMode: 'VIDEO', numHands: 2,
    });
    vision.status = 'ready';
    vision.message = '';
    return true;
  } catch (err) {
    vision.status = 'error';
    vision.message = 'Could not load the face / hand model.';
    return false;
  }
}

// 每帧调用。返回这一帧新算出来的手（没算就是 null，给 frame.js 的 updateFrame 用）
export function pollVision(now, lShape, eyeCfg, handEvery) {
  const v = vision;
  if (v.status !== 'ready' || !v.video || v.video.readyState < 2) return null;
  const t = v.video.currentTime;
  if (t !== v.lastFace) {
    v.lastFace = t;
    const res = v.face.detectForVideo(v.video, now);
    const mats = res.facialTransformationMatrixes;
    if (mats && mats.length) {
      const a = headAngles(mats[0].data);
      v.pitch = a.pitch;
      v.yaw = a.yaw;
      v.faceOk = true;
      v.landmarks = res.faceLandmarks[0];
      const bs = res.faceBlendshapes && res.faceBlendshapes[0];
      if (bs) {
        const get = (n) => (bs.categories.find((c) => c.categoryName === n) || {}).score;
        v.wink = isWink(get('eyeBlinkLeft'), get('eyeBlinkRight'), eyeCfg);
      }
    } else {
      v.faceOk = false;
      v.wink = false;
      v.landmarks = null;
    }
  }
  if (t === v.lastHands) return null;
  v.handCount++;
  if (v.handCount % Math.max(1, handEvery) !== 0) return null;
  v.lastHands = t;
  const res = v.hands.detectForVideo(v.video, now);
  return (res.landmarks || []).map((lm, i) => {
    const world = (res.worldLandmarks && res.worldLandmarks[i]) || lm;
    return { landmarks: lm, world, info: classifyHand(world, lShape) };
  });
}
