// 头部角度（共享）：从 MediaPipe FaceLandmarker 的 4×4 变换矩阵（列主序）求俯仰角和左右转角。
// 旧页面（sketch.js）和 Look Up 都用这一份。
//   R = [[m0, m4, m8], [m1, m5, m9], [m2, m6, m10]]
//   pitch：绕 X 轴，抬头为正（和旧页面的约定一致）
//   yaw：绕 Y 轴，方向没有实测，用的时候可以在 config 里翻转

const DEG = 180 / Math.PI;

export function headAngles(m) {
  const pitch = -Math.atan2(m[6], m[10]) * DEG;
  const yaw = Math.asin(Math.max(-1, Math.min(1, -m[2]))) * DEG;
  return { pitch, yaw };
}
