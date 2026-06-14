import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import './App.css'

type Params = {
  cars: number
  roadLength: number
  duration: number
  dt: number
  baseSpeed: number
  speedVariance: number
  preferredGap: number
  gapVariance: number
  speedGain: number
  followGain: number
  dampingGain: number
  minImpulse: number
  accelLimit: number
  brakeLimit: number
  accelError: number
  seed: number
}

type Car = {
  id: number
  position: number
  speed: number
  preferredSpeed: number
  preferredGap: number
}

type Sample = {
  t: number
  x: number
  v: number
}

type Simulation = {
  histories: Sample[][]
  finalCars: Car[]
  averageSpeed: number
  minimumGap: number
  carCount: number
  steps: number
}

type ViewMode = 'road' | 'phase'
type PhaseMode = '2d' | '3d'

type DiagramParams = {
  delta: number
  xScale: number
  yScale: number
  zScale: number
  xSkew: number
  ySkew: number
  rotateX: number
  rotateY: number
  rotateZ: number
  startCar: number
  selectedCars: number
  carInterval: number
}

type HistoryEntry = {
  samples: Sample[]
  index: number
}

const defaultParams: Params = {
  cars: 100,
  roadLength: 1800,
  duration: 180,
  dt: 0.35,
  baseSpeed: 30,
  speedVariance: 0.18,
  preferredGap: 18,
  gapVariance: 0.28,
  speedGain: 0.22,
  followGain: 0.1,
  dampingGain: 0.55,
  minImpulse: 0.08,
  accelLimit: 2.2,
  brakeLimit: 4.8,
  accelError: 0.08,
  seed: 42,
}

const defaultDiagramParams: DiagramParams = {
  delta: 4,
  xScale: 1,
  yScale: 1,
  zScale: 0.8,
  xSkew: 0,
  ySkew: 0,
  rotateX: 24,
  rotateY: -34,
  rotateZ: 0,
  startCar: 3,
  selectedCars: 4,
  carInterval: 2,
}

const controls: Array<{
  key: keyof Params
  label: string
  min: number
  max: number
  step: number
  suffix?: string
}> = [
  { key: 'cars', label: 'Cars', min: 10, max: 180, step: 1 },
  { key: 'roadLength', label: 'Lane length', min: 600, max: 3600, step: 100, suffix: ' m' },
  { key: 'duration', label: 'Run time', min: 40, max: 360, step: 10, suffix: ' s' },
  { key: 'baseSpeed', label: 'Preferred speed', min: 8, max: 44, step: 1, suffix: ' m/s' },
  { key: 'speedVariance', label: 'Speed variance', min: 0, max: 0.6, step: 0.01 },
  { key: 'preferredGap', label: 'Following distance', min: 6, max: 60, step: 1, suffix: ' m' },
  { key: 'gapVariance', label: 'Gap variance', min: 0, max: 0.8, step: 0.01 },
  { key: 'speedGain', label: 'Speed pull', min: 0, max: 0.8, step: 0.01 },
  { key: 'followGain', label: 'String pull', min: 0, max: 0.5, step: 0.01 },
  { key: 'dampingGain', label: 'Relative damping', min: 0, max: 1.4, step: 0.01 },
  { key: 'minImpulse', label: 'Impulse threshold', min: 0, max: 0.6, step: 0.01 },
  { key: 'accelLimit', label: 'Accel limit', min: 0.4, max: 6, step: 0.1, suffix: ' m/s2' },
  { key: 'brakeLimit', label: 'Brake limit', min: 1, max: 10, step: 0.1, suffix: ' m/s2' },
  { key: 'accelError', label: 'Control error', min: 0, max: 0.45, step: 0.01 },
  { key: 'seed', label: 'Seed', min: 1, max: 999, step: 1 },
]

const diagramControls: Array<{
  key: keyof DiagramParams
  label: string
  min: number
  max: number
  step: number
  suffix?: string
}> = [
  { key: 'delta', label: 'Delta t', min: 1, max: 40, step: 1, suffix: ' s' },
  { key: 'xScale', label: 'X scale', min: 0.25, max: 2.5, step: 0.05 },
  { key: 'yScale', label: 'Y scale', min: 0.25, max: 2.5, step: 0.05 },
  { key: 'zScale', label: 'Z scale', min: 0, max: 2, step: 0.05 },
  { key: 'xSkew', label: 'X skew', min: -1.5, max: 1.5, step: 0.05 },
  { key: 'ySkew', label: 'Y skew', min: -1.5, max: 1.5, step: 0.05 },
  { key: 'rotateX', label: 'Rotate X', min: -90, max: 90, step: 1, suffix: ' deg' },
  { key: 'rotateY', label: 'Rotate Y', min: -90, max: 90, step: 1, suffix: ' deg' },
  { key: 'rotateZ', label: 'Rotate Z', min: -180, max: 180, step: 1, suffix: ' deg' },
  { key: 'startCar', label: 'Starting car', min: 1, max: 180, step: 1 },
  { key: 'selectedCars', label: 'Number of cars', min: 1, max: 100, step: 1 },
  { key: 'carInterval', label: 'Car interval', min: 1, max: 20, step: 1 },
]

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function vary(base: number, variance: number, rand: () => number) {
  return base * (1 + (rand() * 2 - 1) * variance)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function wrap(position: number, roadLength: number) {
  return ((position % roadLength) + roadLength) % roadLength
}

function runSimulation(params: Params): Simulation {
  const rand = mulberry32(params.seed)
  const carLength = 4.8
  const standstillGap = 1.5
  const reactionTime = 0.9
  const carCount = Math.min(params.cars, Math.floor(params.roadLength / (carLength + standstillGap)))
  const spacing = params.roadLength / carCount
  const cars: Car[] = Array.from({ length: carCount }, (_, id) => ({
    id,
    position: id * spacing + (rand() - 0.5) * spacing * 0.2,
    speed: vary(params.baseSpeed, params.speedVariance * 0.4, rand),
    preferredSpeed: vary(params.baseSpeed, params.speedVariance, rand),
    preferredGap: vary(params.preferredGap, params.gapVariance, rand),
  })).sort((a, b) => a.position - b.position)

  const steps = Math.max(2, Math.floor(params.duration / params.dt))
  const histories: Sample[][] = cars.map((car) => [{ t: 0, x: wrap(car.position, params.roadLength), v: car.speed }])
  let minimumGap = params.roadLength
  let averageSpeedTotal = 0

  for (let step = 1; step <= steps; step += 1) {
    const ordered = [...cars].sort((a, b) => a.position - b.position)
    const proposedSpeeds = new Map<number, number>()

    ordered.forEach((car, index) => {
      const leader = ordered[(index + 1) % ordered.length]
      const leaderPosition = leader.position <= car.position ? leader.position + params.roadLength : leader.position
      const gap = Math.max(0.2, leaderPosition - car.position - carLength)
      minimumGap = Math.min(minimumGap, gap)

      const closingSpeed = Math.max(0, car.speed - leader.speed)
      const dynamicGap =
        car.preferredGap +
        car.speed * reactionTime +
        (car.speed * closingSpeed) / (2 * Math.sqrt(params.accelLimit * params.brakeLimit))
      const speedPull = (car.preferredSpeed - car.speed) * params.speedGain
      const stringPull = (gap - dynamicGap) * params.followGain
      const damping = (leader.speed - car.speed) * params.dampingGain
      let acceleration = speedPull + stringPull + damping

      if (Math.abs(acceleration) < params.minImpulse) {
        acceleration = 0
      } else {
        acceleration -= Math.sign(acceleration) * params.minImpulse
      }

      acceleration *= 1 + (rand() * 2 - 1) * params.accelError
      const leaderStopping = (leader.speed * leader.speed) / (2 * params.brakeLimit)
      const followerStopping = (car.speed * car.speed) / (2 * params.brakeLimit)
      const requiredGap = standstillGap + car.speed * params.dt + Math.max(0, followerStopping - leaderStopping)

      if (gap < requiredGap) {
        const urgency = clamp((requiredGap - gap) / Math.max(requiredGap, 1), 0, 1)
        acceleration = Math.min(acceleration, -params.brakeLimit * urgency)
      }

      const clampedAcceleration = clamp(acceleration, -params.brakeLimit, params.accelLimit)
      proposedSpeeds.set(car.id, Math.max(0, car.speed + clampedAcceleration * params.dt))
    })

    const safeSpeeds = new Map(proposedSpeeds)
    for (let pass = 0; pass < carCount; pass += 1) {
      ordered.forEach((car, index) => {
        const leader = ordered[(index + 1) % ordered.length]
        const leaderPosition = leader.position <= car.position ? leader.position + params.roadLength : leader.position
        const leaderSpeed = safeSpeeds.get(leader.id) ?? leader.speed
        const projectedLeaderPosition = leaderPosition + leaderSpeed * params.dt
        const safeTravel = projectedLeaderPosition - car.position - carLength - standstillGap
        const safeSpeed = Math.max(0, safeTravel / params.dt)
        const currentSpeed = safeSpeeds.get(car.id) ?? car.speed

        if (currentSpeed > safeSpeed) {
          safeSpeeds.set(car.id, safeSpeed)
        }
      })
    }

    cars.forEach((car) => {
      car.speed = safeSpeeds.get(car.id) ?? car.speed
      car.position += car.speed * params.dt
      averageSpeedTotal += car.speed
      histories[car.id].push({ t: step * params.dt, x: wrap(car.position, params.roadLength), v: car.speed })
    })

    const afterUpdate = [...cars].sort((a, b) => a.position - b.position)
    afterUpdate.forEach((car, index) => {
      const leader = afterUpdate[(index + 1) % afterUpdate.length]
      const leaderPosition = leader.position <= car.position ? leader.position + params.roadLength : leader.position
      minimumGap = Math.min(minimumGap, Math.max(0, leaderPosition - car.position - carLength))
    })
  }

  return {
    histories,
    finalCars: [...cars].sort((a, b) => a.position - b.position),
    averageSpeed: averageSpeedTotal / (carCount * steps),
    minimumGap,
    carCount,
    steps,
  }
}

function buildPaths(samples: Sample[], width: number, height: number, roadLength: number, duration: number) {
  const paths: string[] = []
  let current = ''
  let previousX = samples[0]?.x ?? 0

  samples.forEach((sample, index) => {
    const x = (sample.x / roadLength) * width
    const y = (sample.t / duration) * height
    const jump = index > 0 && Math.abs(sample.x - previousX) > roadLength * 0.55

    if (jump && current) {
      paths.push(current)
      current = `M ${x.toFixed(2)} ${y.toFixed(2)}`
    } else {
      current += `${current ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }

    previousX = sample.x
  })

  if (current) {
    paths.push(current)
  }

  return paths
}

function buildPhasePaths(
  samples: Sample[],
  width: number,
  height: number,
  diagram: DiagramParams,
  mode: PhaseMode,
  maxSpeed: number,
) {
  const paths: string[] = []
  const sampleDt = samples[1] ? samples[1].t - samples[0].t : 1
  const delaySteps = Math.max(1, Math.round(diagram.delta / sampleDt))
  const startIndex = mode === '3d' ? delaySteps * 2 : delaySteps
  let current = ''

  for (let index = startIndex; index < samples.length; index += 1) {
    const now = samples[index]
    const past = samples[index - delaySteps]
    const older = samples[index - delaySteps * 2] ?? past
    const centeredNow = (now.v / maxSpeed - 0.5) * diagram.xScale
    const centeredPast = (past.v / maxSpeed - 0.5) * diagram.yScale
    const centeredOlder = (older.v / maxSpeed - 0.5) * diagram.zScale
    let x3 = centeredNow + centeredPast * diagram.xSkew * 0.5
    let y3 = centeredPast + centeredNow * diagram.ySkew * 0.5
    let z3 = mode === '3d' ? centeredOlder : 0

    if (mode === '3d') {
      const rx = (diagram.rotateX * Math.PI) / 180
      const ry = (diagram.rotateY * Math.PI) / 180
      const rz = (diagram.rotateZ * Math.PI) / 180
      const yAfterX = y3 * Math.cos(rx) - z3 * Math.sin(rx)
      const zAfterX = y3 * Math.sin(rx) + z3 * Math.cos(rx)
      y3 = yAfterX
      z3 = zAfterX

      const xAfterY = x3 * Math.cos(ry) + z3 * Math.sin(ry)
      const zAfterY = -x3 * Math.sin(ry) + z3 * Math.cos(ry)
      x3 = xAfterY
      z3 = zAfterY

      const xAfterZ = x3 * Math.cos(rz) - y3 * Math.sin(rz)
      const yAfterZ = x3 * Math.sin(rz) + y3 * Math.cos(rz)
      x3 = xAfterZ
      y3 = yAfterZ
    }

    const depthPush = mode === '3d' ? z3 * 0.16 : 0
    const x = width / 2 + (x3 + depthPush) * width * 0.78
    const y = height / 2 - (y3 - depthPush) * height * 0.78
    current += `${current ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }

  if (current) {
    paths.push(current)
  }

  return paths
}

function selectedHistories(histories: Sample[][], diagram: DiagramParams, showAllCars: boolean): HistoryEntry[] {
  if (showAllCars) {
    return histories.map((samples, index) => ({ samples, index }))
  }

  const startIndex = clamp(Math.round(diagram.startCar) - 1, 0, histories.length - 1)
  const interval = Math.max(1, Math.round(diagram.carInterval))
  const count = Math.max(1, Math.round(diagram.selectedCars))
  const selected: HistoryEntry[] = []

  for (let offset = 0; offset < count; offset += 1) {
    const index = startIndex + offset * interval

    if (index >= histories.length) {
      break
    }

    selected.push({ samples: histories[index], index })
  }

  return selected
}

function buildThreePhasePoints(samples: Sample[], diagram: DiagramParams, maxSpeed: number) {
  const points: THREE.Vector3[] = []
  const sampleDt = samples[1] ? samples[1].t - samples[0].t : 1
  const delaySteps = Math.max(1, Math.round(diagram.delta / sampleDt))
  const startIndex = delaySteps * 2

  for (let index = startIndex; index < samples.length; index += 1) {
    const now = samples[index]
    const past = samples[index - delaySteps]
    const older = samples[index - delaySteps * 2]
    const x = (now.v / maxSpeed - 0.5) * 2 * diagram.xScale
    const y = (past.v / maxSpeed - 0.5) * 2 * diagram.yScale
    const z = (older.v / maxSpeed - 0.5) * 2 * diagram.zScale

    points.push(new THREE.Vector3(x + y * diagram.xSkew * 0.35, y + x * diagram.ySkew * 0.35, z))
  }

  return points
}

function ThreePhaseScene({
  histories,
  diagram,
  maxSpeed,
}: {
  histories: HistoryEntry[]
  diagram: DiagramParams
  maxSpeed: number
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current

    if (!mount) {
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf6fbf8)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.rotateSpeed = 4
    controls.zoomSpeed = 1.1
    controls.panSpeed = 0.7
    controls.staticMoving = false
    controls.dynamicDampingFactor = 0.12

    const group = new THREE.Group()
    group.rotation.set(
      (diagram.rotateX * Math.PI) / 180,
      (diagram.rotateY * Math.PI) / 180,
      (diagram.rotateZ * Math.PI) / 180,
    )
    scene.add(group)

    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x263238, transparent: true, opacity: 0.45 })
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.6, 0, 0),
      new THREE.Vector3(1.6, 0, 0),
      new THREE.Vector3(0, -1.6, 0),
      new THREE.Vector3(0, 1.6, 0),
      new THREE.Vector3(0, 0, -1.6),
      new THREE.Vector3(0, 0, 1.6),
    ])
    group.add(new THREE.LineSegments(axisGeometry, axisMaterial))

    histories.forEach(({ samples, index }) => {
      const points = buildThreePhasePoints(samples, diagram, maxSpeed)

      if (points.length < 2) {
        return
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const color = new THREE.Color().setHSL(((index * 31) % 360) / 360, 0.72, 0.42)
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.68 })
      group.add(new THREE.Line(geometry, material))
    })

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      const width = Math.max(clientWidth, 1)
      const height = Math.max(clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      controls.handleResize()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    let animationFrame = 0
    const animate = () => {
      animationFrame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
          object.geometry.dispose()
        }
        if ('material' in object) {
          const material = object.material

          if (Array.isArray(material)) {
            material.forEach((item) => item.dispose())
          } else if (material instanceof THREE.Material) {
            material.dispose()
          }
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [diagram, histories, maxSpeed])

  return <div className="three-phase" ref={mountRef} aria-label="Rotatable 3D speed phase diagram" />
}

function App() {
  const [params, setParams] = useState(defaultParams)
  const [diagramParams, setDiagramParams] = useState(defaultDiagramParams)
  const [viewMode, setViewMode] = useState<ViewMode>('road')
  const [phaseMode, setPhaseMode] = useState<PhaseMode>('2d')
  const [showAllCars, setShowAllCars] = useState(true)
  const simulation = useMemo(() => runSimulation(params), [params])
  const phaseHistories = useMemo(
    () => selectedHistories(simulation.histories, diagramParams, showAllCars),
    [diagramParams, showAllCars, simulation.histories],
  )
  const maxPhaseSpeed = useMemo(
    () => Math.max(1, ...phaseHistories.flatMap(({ samples }) => samples.map((sample) => sample.v))),
    [phaseHistories],
  )
  const graphWidth = 1100
  const graphHeight = 720

  const updateParam = (key: keyof Params, value: number) => {
    setParams((current) => ({ ...current, [key]: value }))
  }

  const updateDiagramParam = (key: keyof DiagramParams, value: number) => {
    setDiagramParams((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Freeway SURF</h1>
          <p>Single-lane traffic waves from tiny human-ish control errors.</p>
        </div>
        <div className="top-actions">
          <div className="segmented" aria-label="Graph view">
            <button className={viewMode === 'road' ? 'active' : ''} type="button" onClick={() => setViewMode('road')}>
              Road
            </button>
            <button className={viewMode === 'phase' ? 'active' : ''} type="button" onClick={() => setViewMode('phase')}>
              Phase
            </button>
          </div>
          <button className="reset-button" type="button" onClick={() => setParams(defaultParams)}>
            Reset
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Freeway simulator">
        <aside className="controls" aria-label="Simulation parameters">
          <div className="control-group">
            <div className="group-title">Simulation</div>
          </div>
          {controls.map((control) => (
            <label className="control" key={control.key}>
              <span>
                {control.label}
                <strong>
                  {Number(params[control.key]).toFixed(control.step < 1 ? 2 : 0)}
                  {control.suffix ?? ''}
                </strong>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={params[control.key]}
                onChange={(event) => updateParam(control.key, Number(event.target.value))}
              />
            </label>
          ))}

          <div className="control-group">
            <div className="group-title">Phase</div>
            <div className="segmented compact" aria-label="Phase dimensions">
              <button className={phaseMode === '2d' ? 'active' : ''} type="button" onClick={() => setPhaseMode('2d')}>
                2D
              </button>
              <button className={phaseMode === '3d' ? 'active' : ''} type="button" onClick={() => setPhaseMode('3d')}>
                3D
              </button>
            </div>
            <div className="segmented compact" aria-label="Car selection">
              <button className={showAllCars ? 'active' : ''} type="button" onClick={() => setShowAllCars(true)}>
                All
              </button>
              <button className={!showAllCars ? 'active' : ''} type="button" onClick={() => setShowAllCars(false)}>
                Pick
              </button>
            </div>
          </div>
          {diagramControls.map((control) => (
            <label className="control" key={control.key}>
              <span>
                {control.label}
                <strong>
                  {Number(diagramParams[control.key]).toFixed(control.step < 1 ? 2 : 0)}
                  {control.suffix ?? ''}
                </strong>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={diagramParams[control.key]}
                onChange={(event) => updateDiagramParam(control.key, Number(event.target.value))}
              />
            </label>
          ))}
        </aside>

        <section className="visuals">
          <div className="stats" aria-label="Simulation stats">
            <div>
              <span>Average speed</span>
              <strong>{simulation.averageSpeed.toFixed(1)} m/s</strong>
            </div>
            <div>
              <span>Minimum gap</span>
              <strong>{simulation.minimumGap.toFixed(1)} m</strong>
            </div>
            <div>
              <span>Cars</span>
              <strong>{simulation.carCount}</strong>
            </div>
          </div>

          <div className="lane-strip" aria-label="Final car positions">
            {simulation.finalCars.map((car) => (
              <span
                className="car-dot"
                key={car.id}
                style={{ left: `${(wrap(car.position, params.roadLength) / params.roadLength) * 100}%` }}
                title={`Car ${car.id + 1}: ${car.speed.toFixed(1)} m/s`}
              />
            ))}
          </div>

          <div className="graph-frame">
            {viewMode === 'phase' && phaseMode === '3d' ? (
              <ThreePhaseScene histories={phaseHistories} diagram={diagramParams} maxSpeed={maxPhaseSpeed} />
            ) : (
              <svg
                className="graph"
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                role="img"
                aria-label={viewMode === 'road' ? 'Car position over time' : 'Car phase diagram'}
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern id="grid" width="100" height="80" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 80" fill="none" stroke="rgba(28, 43, 52, 0.12)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={graphWidth} height={graphHeight} fill="url(#grid)" />
                {viewMode === 'phase' && (
                  <>
                    <line className="axis-line" x1={graphWidth * 0.08} y1={graphHeight / 2} x2={graphWidth * 0.92} y2={graphHeight / 2} />
                    <line className="axis-line" x1={graphWidth / 2} y1={graphHeight * 0.08} x2={graphWidth / 2} y2={graphHeight * 0.92} />
                  </>
                )}
                {(viewMode === 'road' ? simulation.histories.map((samples, index) => ({ samples, index })) : phaseHistories).map(({ samples, index }) => {
                  const paths =
                    viewMode === 'road'
                      ? buildPaths(samples, graphWidth, graphHeight, params.roadLength, params.duration)
                      : buildPhasePaths(samples, graphWidth, graphHeight, diagramParams, phaseMode, maxPhaseSpeed)

                  return paths.map((path, segment) => (
                    <path
                      className={viewMode === 'road' ? 'trace' : 'trace phase-trace'}
                      d={path}
                      key={`${index}-${segment}`}
                      style={{
                        stroke: `hsl(${(index * 31) % 360} 72% 42%)`,
                      }}
                    />
                  ))
                })}
              </svg>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
