import * as THREE from 'three';

// Painted-looking sky dome + sun + ambient + fog for one map.
export function createEnvironment(engine, scene, env, bounds) {
  const q = engine.q;
  const sunDir = new THREE.Vector3(...env.sunDir).normalize();

  // ---- sky dome (cheap analytic gradient + sun + soft fbm clouds)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(env.skyTop) },
      horizon: { value: new THREE.Color(env.skyHorizon) },
      bottom: { value: new THREE.Color(env.skyBottom ?? env.skyHorizon) },
      sunDir: { value: sunDir },
      sunColor: { value: new THREE.Color(env.sunColor) },
      cloudColor: { value: new THREE.Color(env.cloudColor ?? 0xffffff) },
      clouds: { value: env.clouds ?? 0.5 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sunDir, sunColor, cloudColor; uniform float clouds; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<3;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s*1.14; }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(horizon, top, pow(clamp(y,0.0,1.0), 0.55)) : mix(horizon, bottom, clamp(-y*4.0,0.0,1.0));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunColor * (smoothstep(0.9975, 0.9988, sd) * 0.9 + pow(sd, 40.0) * 0.28 + pow(sd, 6.0) * 0.1);
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.12) * 1.6;
          float c = smoothstep(0.5 - clouds*0.25, 0.74, fbm(uv));
          float lit = 0.75 + 0.25 * pow(sd, 3.0);
          col = mix(col, cloudColor * lit, c * smoothstep(0.0, 0.18, y) * 0.85);
        }
        col = floor(col * 48.0 + 0.5) / 48.0; // limited color depth, like a painted sky texture
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // ---- lights
  const hemi = new THREE.HemisphereLight(env.hemiSky ?? env.skyTop, env.groundColor ?? 0x6a5a48, env.ambient ?? 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity ?? 3);
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 4;
  const sunDist = Math.max(120, radius * 1.3);
  sun.position.set(cx + sunDir.x * sunDist, sunDir.y * sunDist, cz + sunDir.z * sunDist);
  sun.target.position.set(cx, 0, cz);
  scene.add(sun); scene.add(sun.target);
  if (q.shadows > 0) {
    sun.castShadow = true;
    // coarse and blurred on purpose: soft shadow pools rather than crisp outlines
    sun.shadow.mapSize.set(env.shadowMap || 1024, env.shadowMap || 1024);
    const c = sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius; c.near = 1; c.far = Math.max(300, radius * 3);
    sun.shadow.bias = env.shadowBias ?? -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3.5;
    c.updateProjectionMatrix();
  }

  scene.fog = new THREE.Fog(env.fogColor ?? env.skyHorizon, env.fogNear ?? 40, env.large ? env.fogFar : Math.min(env.fogFar ?? 260, q.viewDist));
  scene.background = new THREE.Color(env.skyHorizon);

  return { sky, sun, hemi, sunDir };
}
