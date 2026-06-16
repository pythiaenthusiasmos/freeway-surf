import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { AppFrame, ControlGroup, NumericControl, SegmentedControl, StatGrid, StatItem } from '@openclaw/sim-ui'
import './App.css'

type Params = {
  cars: number
  roadLength: number
  duration: number
  dt: number
  vehicleLength: number
  baseSpeed: number
  speedVariance: number
  preferredGap: number
  gapVariance: number
  reactionTime: number
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

type ViewMode = 'road' | 'phase' | 'speedTime' | 'speedPosition' | 'track3d'
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

const trackRadius = 5.48
const baseCarModelLength = 0.34

const defaultParams: Params = {
  cars: 100,
  roadLength: 1800,
  duration: 300,
  dt: 0.35,
  vehicleLength: 4.8,
  baseSpeed: 30,
  speedVariance: 0.49,
  preferredGap: 37,
  gapVariance: 0.28,
  reactionTime: 1,
  speedGain: 0.22,
  followGain: 0.1,
  dampingGain: 0,
  minImpulse: 0.32,
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
  { key: 'vehicleLength', label: 'Vehicle length', min: 3, max: 18, step: 0.2, suffix: ' m' },
  { key: 'baseSpeed', label: 'Preferred speed', min: 8, max: 44, step: 1, suffix: ' m/s' },
  { key: 'speedVariance', label: 'Speed variance', min: 0, max: 0.6, step: 0.01 },
  { key: 'preferredGap', label: 'Following distance', min: 6, max: 60, step: 1, suffix: ' m' },
  { key: 'gapVariance', label: 'Gap variance', min: 0, max: 0.8, step: 0.01 },
  { key: 'reactionTime', label: 'Reaction time', min: 0.2, max: 2.5, step: 0.05, suffix: ' s' },
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
  { key: 'carInterval', label: 'Spacing', min: 1, max: 20, step: 1 },
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

function leaderFrontPosition(followerPosition: number, leaderPosition: number, roadLength: number) {
  return leaderPosition <= followerPosition ? leaderPosition + roadLength : leaderPosition
}

function clearGapToLeader(followerPosition: number, leaderPosition: number, roadLength: number, vehicleLength: number) {
  return leaderFrontPosition(followerPosition, leaderPosition, roadLength) - followerPosition - vehicleLength
}

function runSimulation(params: Params): Simulation {
  const rand = mulberry32(params.seed)
  const vehicleLength = params.vehicleLength
  const standstillGap = 1.5
  const reactionTime = params.reactionTime
  const carCount = Math.min(params.cars, Math.floor(params.roadLength / (vehicleLength + standstillGap)))
  const spacing = params.roadLength / carCount
  const placementJitter = Math.max(0, spacing - vehicleLength - standstillGap) * 0.4
  const cars: Car[] = Array.from({ length: carCount }, (_, id) => ({
    id,
    position: id * spacing + (rand() - 0.5) * placementJitter,
    speed: vary(params.baseSpeed, params.speedVariance * 0.4, rand),
    preferredSpeed: vary(params.baseSpeed, params.speedVariance, rand),
    preferredGap: vary(params.preferredGap, params.gapVariance, rand),
  })).sort((a, b) => a.position - b.position)

  const steps = Math.max(2, Math.floor(params.duration / params.dt))
  const histories: Sample[][] = Array.from({ length: carCount })
  cars.forEach((car) => {
    histories[car.id] = [{ t: 0, x: wrap(car.position, params.roadLength), v: car.speed }]
  })
  let minimumGap = params.roadLength
  let averageSpeedTotal = 0

  for (let step = 1; step <= steps; step += 1) {
    const ordered = [...cars].sort((a, b) => a.position - b.position)
    const proposedSpeeds = new Map<number, number>()

    ordered.forEach((car, index) => {
      const leader = ordered[(index + 1) % ordered.length]
      const gap = clearGapToLeader(car.position, leader.position, params.roadLength, vehicleLength)
      const forceGap = Math.max(0.2, gap)
      minimumGap = Math.min(minimumGap, gap)

      const closingSpeed = Math.max(0, car.speed - leader.speed)
      const dynamicGap =
        car.preferredGap +
        car.speed * reactionTime +
        (car.speed * closingSpeed) / (2 * Math.sqrt(params.accelLimit * params.brakeLimit))
      const speedPull = (car.preferredSpeed - car.speed) * params.speedGain
      const stringPull = (forceGap - dynamicGap) * params.followGain
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

      if (forceGap < requiredGap) {
        const urgency = clamp((requiredGap - forceGap) / Math.max(requiredGap, 1), 0, 1)
        acceleration = Math.min(acceleration, -params.brakeLimit * urgency)
      }

      const clampedAcceleration = clamp(acceleration, -params.brakeLimit, params.accelLimit)
      proposedSpeeds.set(car.id, Math.max(0, car.speed + clampedAcceleration * params.dt))
    })

    const safeSpeeds = new Map(proposedSpeeds)
    for (let pass = 0; pass < carCount; pass += 1) {
      ordered.forEach((car, index) => {
        const leader = ordered[(index + 1) % ordered.length]
        const leaderPosition = leaderFrontPosition(car.position, leader.position, params.roadLength)
        const leaderSpeed = safeSpeeds.get(leader.id) ?? leader.speed
        const projectedLeaderPosition = leaderPosition + leaderSpeed * params.dt
        const safeTravel = projectedLeaderPosition - car.position - vehicleLength - standstillGap
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
      minimumGap = Math.min(minimumGap, clearGapToLeader(car.position, leader.position, params.roadLength, vehicleLength))
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

function buildSpeedTimePath(samples: Sample[], width: number, height: number, duration: number, maxSpeed: number) {
  let path = ''

  samples.forEach((sample) => {
    const x = (sample.t / duration) * width
    const y = height - (sample.v / maxSpeed) * height
    path += `${path ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
  })

  return path ? [path] : []
}

function buildSpeedPositionPaths(samples: Sample[], width: number, height: number, roadLength: number, maxSpeed: number) {
  const paths: string[] = []
  let current = ''
  let previousX = samples[0]?.x ?? 0

  samples.forEach((sample, index) => {
    const x = (sample.x / roadLength) * width
    const y = height - (sample.v / maxSpeed) * height
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

function sampleAtTime(samples: Sample[], time: number, roadLength: number) {
  if (samples.length < 2) {
    return samples[0] ?? { t: 0, x: 0, v: 0 }
  }

  const sampleDt = samples[1].t - samples[0].t || 1
  const lowerIndex = clamp(Math.floor(time / sampleDt), 0, samples.length - 2)
  const upperIndex = lowerIndex + 1
  const lower = samples[lowerIndex]
  const upper = samples[upperIndex]
  const amount = clamp((time - lower.t) / Math.max(upper.t - lower.t, 0.0001), 0, 1)
  let upperX = upper.x

  if (upperX - lower.x > roadLength * 0.5) {
    upperX -= roadLength
  } else if (lower.x - upperX > roadLength * 0.5) {
    upperX += roadLength
  }

  return {
    t: time,
    x: wrap(lower.x + (upperX - lower.x) * amount, roadLength),
    v: lower.v + (upper.v - lower.v) * amount,
  }
}

function createCarModel(index: number) {
  const car = new THREE.Group()
  const hue = ((index * 31) % 360) / 360
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.72, 0.44),
    roughness: 0.48,
    metalness: 0.08,
  })
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0xdde9ee, roughness: 0.28, metalness: 0.05 })
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: 0.7 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.34), bodyMaterial)
  body.position.y = 0.08
  body.castShadow = true
  car.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.16), cabinMaterial)
  cabin.position.set(0, 0.145, -0.02)
  cabin.castShadow = true
  car.add(cabin)

  const wheelGeometry = new THREE.BoxGeometry(0.045, 0.055, 0.07)
  const wheelPositions = [
    [-0.1, 0.04, -0.11],
    [0.1, 0.04, -0.11],
    [-0.1, 0.04, 0.11],
    [0.1, 0.04, 0.11],
  ]

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheel.position.set(x, y, z)
    car.add(wheel)
  })

  return car
}

function TrackScene({
  histories,
  roadLength,
  duration,
  vehicleLength,
}: {
  histories: Sample[][]
  roadLength: number
  duration: number
  vehicleLength: number
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current

    if (!mount) {
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf6fbf8)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 11.4, 11.2)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.rotateSpeed = 2.3
    controls.zoomSpeed = 0.9
    controls.panSpeed = 0.45
    controls.dynamicDampingFactor = 0.12

    const ambient = new THREE.HemisphereLight(0xffffff, 0x94a19a, 1.9)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6)
    keyLight.position.set(4, 9, 5)
    keyLight.castShadow = true
    scene.add(keyLight)

    const track = new THREE.Group()
    scene.add(track)

    const road = new THREE.Mesh(
      new THREE.RingGeometry(4.7, 6.25, 160),
      new THREE.MeshStandardMaterial({ color: 0x3f4a50, roughness: 0.82 }),
    )
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    track.add(road)

    const infield = new THREE.Mesh(
      new THREE.CircleGeometry(4.35, 160),
      new THREE.MeshStandardMaterial({ color: 0xd6ead6, roughness: 0.9 }),
    )
    infield.rotation.x = -Math.PI / 2
    infield.position.y = -0.006
    infield.receiveShadow = true
    track.add(infield)

    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xf8edba, transparent: true, opacity: 0.9 })
    const dashGeometry = new THREE.BoxGeometry(0.045, 0.012, 0.42)
    for (let index = 0; index < 56; index += 1) {
      const angle = (index / 56) * Math.PI * 2
      const dash = new THREE.Mesh(dashGeometry, dashMaterial)
      dash.position.set(Math.cos(angle) * 5.48, 0.012, Math.sin(angle) * 5.48)
      dash.rotation.y = -angle
      track.add(dash)
    }

    const cars = histories.map((_, index) => {
      const car = createCarModel(index)
      const visibleLength = (vehicleLength / roadLength) * Math.PI * 2 * trackRadius
      car.scale.setScalar(clamp(visibleLength / baseCarModelLength, 0.42, 1.15))
      track.add(car)
      return car
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

    const start = performance.now()
    let animationFrame = 0
    const animate = () => {
      const elapsed = (performance.now() - start) / 1000
      const simulationTime = (elapsed * 24) % duration

      histories.forEach((samples, index) => {
        const sample = sampleAtTime(samples, simulationTime, roadLength)
        const angle = (sample.x / roadLength) * Math.PI * 2
        const laneOffset = ((index % 5) - 2) * 0.045
        const radius = 5.48 + laneOffset
        const car = cars[index]

        car.position.set(Math.cos(angle) * radius, 0.03, Math.sin(angle) * radius)
        car.rotation.y = -angle
      })

      track.rotation.y += 0.0009
      controls.update()
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(animate)
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
  }, [duration, histories, roadLength, vehicleLength])

  return <div className="track-scene" ref={mountRef} aria-label="Animated 3D track view of the traffic simulation" />
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
  const selectedGraphHistories = viewMode === 'road' ? simulation.histories.map((samples, index) => ({ samples, index })) : phaseHistories
  const graphLabel =
    viewMode === 'road'
      ? 'Car position over time'
      : viewMode === 'phase'
        ? 'Car phase diagram'
        : viewMode === 'speedTime'
          ? 'Car speed over time'
          : viewMode === 'speedPosition'
            ? 'Car speed by road position'
            : 'Animated 3D track view'
  const graphWidth = 1100
  const graphHeight = 720

  const updateParam = (key: keyof Params, value: number) => {
    setParams((current) => ({ ...current, [key]: value }))
  }

  const updateDiagramParam = (key: keyof DiagramParams, value: number) => {
    if (key === 'startCar' || key === 'selectedCars' || key === 'carInterval') {
      setShowAllCars(false)
    }

    setDiagramParams((current) => ({ ...current, [key]: value }))
  }

  return (
    <AppFrame
      className="freeway-app"
      title="Freeway SURF"
      viewportLabel="Freeway simulator"
      actions={
        <>
          <SegmentedControl
            label="Graph view"
            value={viewMode}
            options={[
              { value: 'road', label: 'Road' },
              { value: 'phase', label: 'Phase' },
              { value: 'speedTime', label: 'Speed/time' },
              { value: 'speedPosition', label: 'Speed/position' },
              { value: 'track3d', label: 'Track 3D' },
            ]}
            onChange={setViewMode}
          />
          <button className="reset-button" type="button" onClick={() => setParams(defaultParams)}>
            Reset
          </button>
        </>
      }
      controls={
        <>
          <ControlGroup title="Simulation">
            {controls.map((control) => (
              <NumericControl item={control} key={control.key} values={params} onChange={updateParam} />
            ))}
          </ControlGroup>
          <ControlGroup title="Phase">
            <SegmentedControl
              label="Phase dimensions"
              value={phaseMode}
              options={[
                { value: '2d', label: '2D' },
                { value: '3d', label: '3D' },
              ]}
              onChange={setPhaseMode}
            />
            <SegmentedControl
              label="Car selection"
              value={showAllCars ? 'all' : 'pick'}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pick', label: 'Pick' },
              ]}
              onChange={(value) => setShowAllCars(value === 'all')}
            />
            {diagramControls.map((control) => (
              <NumericControl item={control} key={control.key} values={diagramParams} onChange={updateDiagramParam} />
            ))}
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatGrid>
            <StatItem label="Average speed" value={`${simulation.averageSpeed.toFixed(1)} m/s`} />
            <StatItem label="Minimum gap" value={`${simulation.minimumGap.toFixed(1)} m`} />
            <StatItem label="Cars" value={simulation.carCount} />
          </StatGrid>
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
        </>
      }
      viewport={
        <div className="graph-frame">
            {viewMode === 'track3d' ? (
              <TrackScene
                histories={simulation.histories}
                roadLength={params.roadLength}
                duration={params.duration}
                vehicleLength={params.vehicleLength}
              />
            ) : viewMode === 'phase' && phaseMode === '3d' ? (
              <ThreePhaseScene histories={phaseHistories} diagram={diagramParams} maxSpeed={maxPhaseSpeed} />
            ) : (
              <svg
                className="graph"
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                role="img"
                aria-label={graphLabel}
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
                {(viewMode === 'speedTime' || viewMode === 'speedPosition') && (
                  <>
                    <line className="axis-line corner-axis" x1={0} y1={graphHeight} x2={graphWidth} y2={graphHeight} />
                    <line className="axis-line corner-axis" x1={0} y1={0} x2={0} y2={graphHeight} />
                  </>
                )}
                {selectedGraphHistories.map(({ samples, index }) => {
                  const paths = (() => {
                    if (viewMode === 'road') {
                      return buildPaths(samples, graphWidth, graphHeight, params.roadLength, params.duration)
                    }

                    if (viewMode === 'phase') {
                      return buildPhasePaths(samples, graphWidth, graphHeight, diagramParams, phaseMode, maxPhaseSpeed)
                    }

                    if (viewMode === 'speedTime') {
                      return buildSpeedTimePath(samples, graphWidth, graphHeight, params.duration, maxPhaseSpeed)
                    }

                    return buildSpeedPositionPaths(samples, graphWidth, graphHeight, params.roadLength, maxPhaseSpeed)
                  })()

                  return paths.map((path, segment) => (
                    <path
                      className={viewMode === 'road' ? 'trace' : 'trace analysis-trace'}
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
      }
    />
  )
}

export default App
