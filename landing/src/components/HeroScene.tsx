'use client';

import { Component, type ReactNode, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function GrowthOrb({ reducedMotion }: { reducedMotion: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (reducedMotion || !mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.y = t * 0.11;
    mesh.current.rotation.x = Math.sin(t * 0.18) * 0.14;
    if (ring.current) {
      ring.current.rotation.z = t * 0.16;
      ring.current.rotation.x = Math.PI / 2.55;
    }
    if (ring2.current) {
      ring2.current.rotation.z = -t * 0.1;
      ring2.current.rotation.y = Math.PI / 5;
    }
  });

  return (
    <Float
      speed={reducedMotion ? 0 : 1.15}
      rotationIntensity={reducedMotion ? 0 : 0.35}
      floatIntensity={reducedMotion ? 0 : 0.55}
    >
      <Sphere ref={mesh} args={[1.32, 64, 64]} position={[0.55, 0.05, 0]}>
        <MeshDistortMaterial
          color="#34d399"
          attach="material"
          distort={reducedMotion ? 0.12 : 0.36}
          speed={reducedMotion ? 0.4 : 1.45}
          roughness={0.18}
          metalness={0.32}
          transparent
          opacity={0.9}
        />
      </Sphere>
      <Sphere args={[1.62, 32, 32]} position={[0.55, 0.05, 0]}>
        <meshBasicMaterial color="#059669" transparent opacity={0.1} wireframe />
      </Sphere>
      <mesh ref={ring} position={[0.55, 0.05, 0]}>
        <torusGeometry args={[1.95, 0.018, 12, 96]} />
        <meshBasicMaterial color="#a7f3d0" transparent opacity={0.5} />
      </mesh>
      <mesh ref={ring2} position={[0.55, 0.05, 0]}>
        <torusGeometry args={[2.25, 0.01, 12, 80]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.22} />
      </mesh>
      <Sphere args={[0.28, 24, 24]} position={[-1.35, 0.85, 0.4]}>
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.35} />
      </Sphere>
    </Float>
  );
}

function Particles({ reducedMotion }: { reducedMotion: boolean }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 140;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.25) * 7.5;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 5.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (reducedMotion || !points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.028;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.032}
        color="#a7f3d0"
        transparent
        opacity={0.65}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function Scene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 3, 2]} intensity={1.15} color="#ecfdf5" />
      <pointLight position={[-3, -1, 2]} intensity={0.75} color="#059669" />
      <GrowthOrb reducedMotion={reducedMotion} />
      <Particles reducedMotion={reducedMotion} />
    </>
  );
}

export default function HeroScene({
  reducedMotion = false,
  onError,
}: {
  reducedMotion?: boolean;
  onError?: () => void;
}) {
  return (
    <SceneErrorBoundary onError={onError}>
      <Canvas
        style={{ width: '100%', height: '100%', display: 'block' }}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 5.4], fov: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Scene reducedMotion={reducedMotion} />
      </Canvas>
    </SceneErrorBoundary>
  );
}
