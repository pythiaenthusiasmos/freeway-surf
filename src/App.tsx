import { useMemo, useState } from 'react'
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
  lag: number
  xScale: number
  yScale: number
  zScale: number
  xSkew: number
  ySkew: number
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
  lag: 8,
  xScale: 1,
  yScale: 1,
  zScale: 0.8,
  xSkew: 0,
  ySkew: 0,
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
  { key: 'lag', label: 'Past lag', min: 1, max: 60, step: 1, suffix: ' s' },
  { key: 'xScale', label: 'X scale', min: 0.25, max: 2.5, step: 0.05 },
  { key: 'yScale', label: 'Y scale', min: 0.25, max: 2.5, step: 0.05 },
  { key: 'zScale', label: 'Time depth', min: 0, max: 2, step: 0.05 },
  { key: 'xSkew', label: 'X skew', min: -1.5, max: 1.5, step: 0.05 },
  { key: 'ySkew', label: 'Y skew', min: -1.5, max: 1.5, step: 0.05 },
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
  const histories: Sample[][] = cars.map((car) => [{ t: 0, x: wrap(car.position, params.roadLength) }])
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
      histories[car.id].push({ t: step * params.dt, x: wrap(car.position, params.roadLength) })
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
  roadLength: number,
  duration: number,
  diagram: DiagramParams,
  mode: PhaseMode,
) {
  const paths: string[] = []
  const sampleDt = samples[1] ? samples[1].t - samples[0].t : 1
  const lagSteps = Math.max(1, Math.round(diagram.lag / sampleDt))
  let current = ''
  let previousNow = samples[lagSteps]?.x ?? 0
  let previousPast = samples[0]?.x ?? 0

  for (let index = lagSteps; index < samples.length; index += 1) {
    const now = samples[index]
    const past = samples[index - lagSteps]
    const nowUnit = now.x / roadLength
    const pastUnit = past.x / roadLength
    const timeUnit = now.t / duration
    const centeredNow = (nowUnit - 0.5) * diagram.xScale
    const centeredPast = (pastUnit - 0.5) * diagram.yScale
    const centeredTime = (timeUnit - 0.5) * diagram.zScale

    let x = width / 2 + centeredNow * width * 0.82 + centeredPast * diagram.xSkew * width * 0.32
    let y = height / 2 - centeredPast * height * 0.82 + centeredNow * diagram.ySkew * height * 0.32

    if (mode === '3d') {
      x += centeredTime * width * 0.34
      y -= centeredTime * height * 0.28
    }

    const wraps =
      Math.abs(now.x - previousNow) > roadLength * 0.55 || Math.abs(past.x - previousPast) > roadLength * 0.55

    if (wraps && current) {
      paths.push(current)
      current = `M ${x.toFixed(2)} ${y.toFixed(2)}`
    } else {
      current += `${current ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }

    previousNow = now.x
    previousPast = past.x
  }

  if (current) {
    paths.push(current)
  }

  return paths
}

function App() {
  const [params, setParams] = useState(defaultParams)
  const [diagramParams, setDiagramParams] = useState(defaultDiagramParams)
  const [viewMode, setViewMode] = useState<ViewMode>('road')
  const [phaseMode, setPhaseMode] = useState<PhaseMode>('2d')
  const simulation = useMemo(() => runSimulation(params), [params])
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
                  {phaseMode === '3d' && (
                    <line className="axis-line depth" x1={graphWidth * 0.33} y1={graphHeight * 0.72} x2={graphWidth * 0.67} y2={graphHeight * 0.28} />
                  )}
                </>
              )}
              {simulation.histories.map((samples, index) => {
                const paths =
                  viewMode === 'road'
                    ? buildPaths(samples, graphWidth, graphHeight, params.roadLength, params.duration)
                    : buildPhasePaths(
                        samples,
                        graphWidth,
                        graphHeight,
                        params.roadLength,
                        params.duration,
                        diagramParams,
                        phaseMode,
                      )

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
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
