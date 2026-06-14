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
  steps: number
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
  const spacing = params.roadLength / params.cars
  const cars: Car[] = Array.from({ length: params.cars }, (_, id) => ({
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
    const accelerations = new Map<number, number>()

    ordered.forEach((car, index) => {
      const leader = ordered[(index + 1) % ordered.length]
      const leaderPosition = leader.position <= car.position ? leader.position + params.roadLength : leader.position
      const gap = Math.max(0.5, leaderPosition - car.position - 4.8)
      minimumGap = Math.min(minimumGap, gap)

      const speedPull = (car.preferredSpeed - car.speed) * params.speedGain
      const stringPull = (gap - car.preferredGap) * params.followGain
      const damping = (leader.speed - car.speed) * params.dampingGain
      let acceleration = speedPull + stringPull + damping

      if (Math.abs(acceleration) < params.minImpulse) {
        acceleration = 0
      } else {
        acceleration -= Math.sign(acceleration) * params.minImpulse
      }

      acceleration *= 1 + (rand() * 2 - 1) * params.accelError
      accelerations.set(car.id, clamp(acceleration, -params.brakeLimit, params.accelLimit))
    })

    cars.forEach((car) => {
      const acceleration = accelerations.get(car.id) ?? 0
      car.speed = Math.max(0, car.speed + acceleration * params.dt)
      car.position += car.speed * params.dt
      averageSpeedTotal += car.speed
      histories[car.id].push({ t: step * params.dt, x: wrap(car.position, params.roadLength) })
    })
  }

  return {
    histories,
    finalCars: [...cars].sort((a, b) => a.position - b.position),
    averageSpeed: averageSpeedTotal / (params.cars * steps),
    minimumGap,
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

function App() {
  const [params, setParams] = useState(defaultParams)
  const simulation = useMemo(() => runSimulation(params), [params])
  const graphWidth = 1100
  const graphHeight = 720

  const updateParam = (key: keyof Params, value: number) => {
    setParams((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Freeway SURF</h1>
          <p>Single-lane traffic waves from tiny human-ish control errors.</p>
        </div>
        <button className="reset-button" type="button" onClick={() => setParams(defaultParams)}>
          Reset
        </button>
      </header>

      <section className="workspace" aria-label="Freeway simulator">
        <aside className="controls" aria-label="Simulation parameters">
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
              <span>Steps</span>
              <strong>{simulation.steps}</strong>
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
              aria-label="Car position over time"
              preserveAspectRatio="none"
            >
              <defs>
                <pattern id="grid" width="100" height="80" patternUnits="userSpaceOnUse">
                  <path d="M 100 0 L 0 0 0 80" fill="none" stroke="rgba(28, 43, 52, 0.12)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={graphWidth} height={graphHeight} fill="url(#grid)" />
              {simulation.histories.map((samples, index) =>
                buildPaths(samples, graphWidth, graphHeight, params.roadLength, params.duration).map((path, segment) => (
                  <path
                    className="trace"
                    d={path}
                    key={`${index}-${segment}`}
                    style={{
                      stroke: `hsl(${(index * 31) % 360} 72% 42%)`,
                    }}
                  />
                )),
              )}
            </svg>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
