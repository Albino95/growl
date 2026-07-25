'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';

function GrowthOrb({ reducedMotion }: { reducedMotion: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (reducedMotion || !mesh.current) return;
    mesh.current.rotation.y = state.clock.elapsedTime * 0.12;
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.15;
    if (ring.current) {
      ring.current.rotation.z = state.clock.elapsedTime * 0.18;
      ring.current.rotation.x = Math.PI / 2.6;
    }
  });

  return (
    <Float speed={reducedMotion ? 0 : 1.2} rotationIntensity={reducedMotion ? 0 : 0.4} floatIntensity={reducedMotion ? 0 : 0.6}>
      <Sphere ref={mesh} args={[1.35, 64, 64]} position={[0.4, 0.1, 0]}>
        <MeshDistortMaterial
          color="#34d399"
          attach="material"
          distort={reducedMotion ? 0.15 : 0.38}
          speed={reducedMotion ? 0.5 : 1.6}
          roughness={0.15}
          metalness={0.35}
          transparent
          opacity={0.92}
        />
      </Sphere>
      <Sphere args={[1.7, 32, 32]} position={[0.4, 0.1, 0]}>
        <meshBasicMaterial color="#059669" transparent opacity={0.12} wireframe />
      </Sphere>
      <mesh ref={ring} position={[0.4, 0.1, 0]}>
        <torusGeometry args={[2.05, 0.02, 16, 96]} />
        <meshBasicMaterial color="#a7f3d0" transparent opacity={0.45} />
      </mesh>
    </Float>
  );
}

function Particles({ reducedMotion }: { reducedMotion: boolean }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 180;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.35) * 8;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (reducedMotion || !points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.03;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={0.035} color="#a7f3d0" transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Scene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 3, 2]} intensity={1.2} color="#ecfdf5" />
      <pointLight position={[-3, -1, 2]} intensity={0.8} color="#059669" />
      <GrowthOrb reducedMotion={reducedMotion} />
      <Particles reducedMotion={reducedMotion} />
    </>
  );
}

export default function HeroScene({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 5.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <Scene reducedMotion={reducedMotion} />
    </Canvas>
  );
}
