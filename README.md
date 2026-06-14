# Freeway SURF

A TypeScript/React single-lane traffic simulator for exploring stop-and-go waves.

The simulation starts with 100 cars on a ring road. Each car has a preferred speed and following distance, with tunable variance. Drivers respond to the car ahead through a spring-like following force, relative-speed damping, acceleration/braking limits, an impulse threshold, and noisy control error.

The graph plots position left to right and time top to bottom. Each trace is one car.

## Run

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```
