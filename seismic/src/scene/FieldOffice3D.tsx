import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { palette } from "../theme/tokens";
import { useSimulation } from "../store/simulationStore";
import { buildSourcePoints } from "../domain/survey";
import { makeProjector } from "./sceneMath";
import type { FleetState } from "../simulation/engine";

function usePrefersReducedMotion() {
  return useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
}

function CameraRig({ animate }: { animate: boolean }) {
  useFrame(({ camera, clock }) => {
    const a = animate ? clock.getElapsedTime() * 0.05 : 0.6;
    camera.position.set(Math.sin(a) * 13, 9.5, Math.cos(a) * 13);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Nomad-style vibrator truck: chassis, cab and baseplate (pulses while sweeping). */
function VibratorTruck({ fleet, project, offset }: { fleet: FleetState; project: (p: FleetState["position"]) => [number, number, number]; offset: number }) {
  const plate = useRef<Group>(null);
  const sweeping = fleet.phase === "sweeping";
  useFrame(({ clock }) => {
    if (plate.current) plate.current.position.y = sweeping ? 0.05 + Math.sin(clock.getElapsedTime() * 40) * 0.02 : 0.05;
  });
  const [x, , z] = project(fleet.position);
  const bodyColor = fleet.hasFix ? palette.gold500 : palette.danger;
  return (
    <group position={[x + offset, 0, z]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.9, 0.32, 0.42]} />
        <meshStandardMaterial color={bodyColor} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0.5, 0.42, 0]} castShadow>
        <boxGeometry args={[0.28, 0.36, 0.4]} />
        <meshStandardMaterial color={palette.ink100} metalness={0.3} roughness={0.4} />
      </mesh>
      <group ref={plate}>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.5, 0.06, 0.36]} />
          <meshStandardMaterial color={sweeping ? palette.gold300 : palette.petroleum300} emissive={sweeping ? palette.gold500 : "#000"} emissiveIntensity={sweeping ? 0.8 : 0} />
        </mesh>
      </group>
    </group>
  );
}

function Recorder508XT({ position }: { position: [number, number, number] }) {
  const ready = useSimulation((s) => s.sim.recorder.ready);
  return (
    <group position={position}>
      {/* Recording "dog house" / virtual field office */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.6, 0.9, 0.9]} />
        <meshPhysicalMaterial color={palette.petroleum500} transmission={0.4} roughness={0.15} thickness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6]} />
        <meshStandardMaterial color={palette.gold500} metalness={1} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color={ready ? palette.success : palette.danger} emissive={ready ? palette.success : palette.danger} emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

function Scene({ animate }: { animate: boolean }) {
  const geometry = useSimulation((s) => s.geometry);
  const fleets = useSimulation((s) => s.sim.fleets);
  const nodes = useSimulation((s) => s.sim.nodes);
  const sources = useMemo(() => buildSourcePoints(geometry), [geometry]);
  const project = useMemo(() => makeProjector([...sources.map((s) => s.position), ...nodes.map((n) => n.position)]), [sources, nodes]);
  const plan = useSimulation((s) => s.plan);

  const doneIds = useMemo(() => {
    const set = new Set<string>();
    fleets.forEach((f, i) => plan.fleets[i]?.tasks.slice(0, f.taskIndex).forEach((t) => set.add(t.sourcePointId)));
    return set;
  }, [fleets, plan]);

  return (
    <>
      <CameraRig animate={animate} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 14, 6]} intensity={1.4} color={palette.gold300} castShadow />
      <pointLight position={[-8, 6, -8]} intensity={40} color={palette.petroleum300} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial color={palette.petroleum800} roughness={0.95} />
      </mesh>
      <gridHelper args={[22, 22, palette.gold700, palette.petroleum700]} position={[0, 0.005, 0]} />

      {sources.map((s) => {
        const [x, , z] = project(s.position);
        const done = doneIds.has(s.id);
        return (
          <mesh key={s.id} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 12]} />
            <meshBasicMaterial color={done ? palette.gold500 : palette.ink300} />
          </mesh>
        );
      })}

      {nodes.map((n) => {
        const [x, , z] = project(n.position);
        return (
          <mesh key={n.id} position={[x, 0.08, z]}>
            <boxGeometry args={[0.12, 0.16, 0.12]} />
            <meshStandardMaterial color={n.ok ? palette.petroleum300 : palette.danger} emissive={n.ok ? "#000" : palette.danger} emissiveIntensity={n.ok ? 0 : 0.9} />
          </mesh>
        );
      })}

      {fleets.map((f, i) => <VibratorTruck key={f.id} fleet={f} project={project} offset={i * 0.02} />)}
      <Recorder508XT position={[-8.5, 0, 8.5]} />
      {/* DGPS base station */}
      <group position={[8.5, 0, 8.5]}>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.04, 0.06, 1.2]} /><meshStandardMaterial color={palette.ink100} /></mesh>
        <mesh position={[0, 1.25, 0]}><cylinderGeometry args={[0.18, 0.18, 0.06, 24]} /><meshStandardMaterial color={palette.gold500} metalness={0.9} roughness={0.2} /></mesh>
      </group>
    </>
  );
}

export default function FieldOffice3D() {
  const reduced = usePrefersReducedMotion();
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, position: [12, 11, 12] }} aria-hidden="true">
      <color attach="background" args={[palette.petroleum900]} />
      <fog attach="fog" args={[palette.petroleum900, 20, 40]} />
      <Scene animate={!reduced} />
    </Canvas>
  );
}
