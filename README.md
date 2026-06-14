# Freeway SURF

A TypeScript/React single-lane traffic simulator for exploring stop-and-go waves.

The simulation starts with 100 cars on a ring road. Each car has a preferred speed and following distance, with tunable variance. Drivers respond to the car ahead through a spring-like following force, relative-speed damping, acceleration/braking limits, an impulse threshold, and noisy control error.

The road graph plots position left to right and time top to bottom. Each trace is one car.

The phase view plots speed delay coordinates: `v(t)` against `v(t - delta)`, with a 3D projection option that adds `v(t - 2*delta)`. Axis scale, skew, and 3D rotation controls make it easier to inspect loop structure and wave shape.

The phase view can show all cars or a selected sequence by starting car, count, and interval.

## Run

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```
