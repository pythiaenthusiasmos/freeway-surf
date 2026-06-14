# Freeway SURF

A TypeScript/React single-lane traffic simulator for exploring stop-and-go waves.

The simulation starts with 100 cars on a ring road. Each car has a preferred speed and following distance, with tunable variance. Drivers respond to the car ahead through a spring-like following force, relative-speed damping, acceleration/braking limits, an impulse threshold, and noisy control error.

The road graph plots position left to right and time top to bottom. Each trace is one car.

The phase view plots `x(t)` against `x(t - lag)`, with a 3D projection option that uses time as depth. Axis scale and skew controls make it easier to inspect loop structure and wave shape.

## Run

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```
