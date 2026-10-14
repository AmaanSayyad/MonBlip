'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Slow Earth limb for the landing hero. The night map is NASA imagery
 * redistributed with the three.js examples (public domain).
 */
export function EarthHorizon() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x070010, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    camera.position.set(0, 1.05, 2.65);
    camera.lookAt(0, -0.05, 0);

    const placeholder = new THREE.DataTexture(new Uint8Array([2, 0, 8, 255]), 1, 1);
    placeholder.needsUpdate = true;
    placeholder.colorSpace = THREE.SRGBColorSpace;
    const sunDir = new THREE.Vector3(1, 0.22, 0.15).normalize();
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 160, 120),
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: placeholder },
          sunDir: { value: sunDir },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vNormal = normalize(mat3(modelMatrix) * normal);
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform vec3 sunDir;
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vec3 lights = texture2D(map, vUv).rgb;
            float luma = max(lights.r, max(lights.g, lights.b));
            float city = smoothstep(0.07, 0.62, luma);
            vec3 n = normalize(vNormal);
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float ndv = abs(dot(n, viewDir));
            float rim = pow(1.0 - ndv, 3.4);
            float edge = pow(1.0 - ndv, 1.6);
            vec3 sun = normalize(sunDir);
            float sunFace = max(dot(n, sun), 0.0);
            float highlight = pow(sunFace, 22.0);
            vec3 onyx = vec3(0.027, 0.0, 0.063);
            vec3 indigo = vec3(0.439, 0.020, 0.988);
            vec3 lilac = vec3(0.718, 0.506, 0.996);
            vec3 ocean = onyx * (0.45 + ndv);
            vec3 cities = vec3(0.988, 0.984, 1.0) * pow(luma, 0.75) * (1.1 + city * 2.2);
            vec3 color = ocean + cities;
            color += indigo * edge * 0.85;
            color += lilac * rim * 1.7;
            color += vec3(0.988, 0.984, 1.0) * highlight * rim * 2.2;
            color += indigo * pow(sunFace, 2.2) * edge * 1.15;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    );
    earth.position.set(0.12, -2.12, 0);
    earth.scale.setScalar(1.95);
    earth.rotation.x = -0.38;
    earth.rotation.y = -1.45;

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.018, 128, 96),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { sunDir: { value: sunDir } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vSunView;
          uniform vec3 sunDir;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vSunView = normalize(mat3(viewMatrix) * sunDir);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vSunView;
          void main() {
            float fresnel = pow(max(0.0, 0.68 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.1);
            float sun = pow(max(dot(normalize(vNormal), normalize(vSunView)), 0.0), 1.6);
            vec3 indigo = vec3(0.439, 0.020, 0.988);
            vec3 lilac = vec3(0.718, 0.506, 0.996);
            vec3 glow = indigo * fresnel * 1.35;
            glow += lilac * fresnel * sun * 1.6;
            gl_FragColor = vec4(glow, 1.0);
          }
        `,
      }),
    );
    earth.add(atmosphere);

    const starCount = 70;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      starPositions[i * 3] = (Math.random() - 0.5) * 7.5;
      starPositions[i * 3 + 1] = 0.35 + Math.random() * 2.4;
      starPositions[i * 3 + 2] = -1.6 - Math.random() * 2.2;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions, 3)),
      new THREE.PointsMaterial({
        color: 0xf7f4ff,
        size: 0.018,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    scene.add(stars);
    scene.add(earth);

    const loader = new THREE.TextureLoader();
    let disposed = false;
    loader.load('/brand/earth-lights.png', (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const material = earth.material as THREE.ShaderMaterial;
      material.uniforms.map.value = texture;
    });

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const tick = () => {
      if (!reduced) earth.rotation.y += 0.00012;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      const material = earth.material as THREE.ShaderMaterial;
      (material.uniforms.map.value as THREE.Texture | null)?.dispose();
      material.dispose();
      earth.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div ref={hostRef} className="absolute inset-0" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 28% 16% at 64% 62%, rgba(252,251,255,0.45) 0%, rgba(183,129,254,0.32) 16%, rgba(112,5,252,0.2) 38%, transparent 68%)',
        }}
      />
    </div>
  );
}
