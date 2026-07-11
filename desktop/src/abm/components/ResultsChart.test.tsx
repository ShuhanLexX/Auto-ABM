import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { VizSpec, VizTable } from '../types'
import { ResultsChart } from './ResultsChart'

afterEach(cleanup)

function spec(overrides: Partial<VizSpec> = {}): VizSpec {
  return {
    chart: 'bar',
    title: 'Final infected vs beta',
    data_ref: { source: 'experiment', id: 'e1' },
    encodings: [
      { field: 'beta', role: 'x' },
      { field: 'infected.final', role: 'y' },
    ],
    ...overrides,
  }
}

const data: VizTable = {
  columns: ['beta', 'infected.final', 'seed'],
  rows: [
    { beta: 0.1, 'infected.final': 0.3, seed: 1 },
    { beta: 0.2, 'infected.final': 0.6, seed: 1 },
    { beta: 0.3, 'infected.final': 0.8, seed: 1 },
  ],
}

describe('ResultsChart', () => {
  it('renders a bar per row binding the real y column', () => {
    render(<ResultsChart spec={spec()} data={data} />)
    expect(screen.getByTestId('results-chart')).toBeTruthy()
    expect(screen.getAllByTestId('results-bar')).toHaveLength(3)
  })

  it('can hide its internal title when embedded in a chart card', () => {
    render(<ResultsChart spec={spec()} data={data} showTitle={false} />)
    expect(screen.queryByText('Final infected vs beta')).toBeNull()
  })

  it('renders a line series for a line chart', () => {
    render(<ResultsChart spec={spec({ chart: 'line' })} data={data} />)
    expect(screen.getByTestId('results-series-infected.final')).toBeTruthy()
  })

  it('renders a point per row for a scatter chart', () => {
    render(<ResultsChart spec={spec({ chart: 'scatter' })} data={data} />)
    expect(screen.getAllByTestId('results-point')).toHaveLength(3)
  })

  it('shows an empty state (not a fabricated chart) when there are no rows', () => {
    render(<ResultsChart spec={spec()} data={{ columns: data.columns, rows: [] }} />)
    expect(screen.getByTestId('results-chart-empty')).toBeTruthy()
    expect(screen.queryByTestId('results-bar')).toBeNull()
  })

  it('shows an empty state when the spec lacks a y encoding', () => {
    render(
      <ResultsChart
        spec={spec({ encodings: [{ field: 'beta', role: 'x' }] })}
        data={data}
      />,
    )
    expect(screen.getByTestId('results-chart-empty')).toBeTruthy()
  })

  it('renders multiple y series with a legend entry each', () => {
    const multi: VizTable = {
      columns: ['beta', 'infected.final', 'recovered.final'],
      rows: [
        { beta: 0.1, 'infected.final': 0.3, 'recovered.final': 0.1 },
        { beta: 0.2, 'infected.final': 0.6, 'recovered.final': 0.3 },
      ],
    }
    render(
      <ResultsChart
        spec={spec({
          chart: 'line',
          encodings: [
            { field: 'beta', role: 'x' },
            { field: 'infected.final', role: 'y' },
            { field: 'recovered.final', role: 'y' },
          ],
        })}
        data={multi}
      />,
    )
    expect(screen.getByTestId('results-series-infected.final')).toBeTruthy()
    expect(screen.getByTestId('results-series-recovered.final')).toBeTruthy()
  })

  it('limits x-axis labels for long experiment series', () => {
    render(
      <ResultsChart
        spec={spec({ chart: 'line' })}
        data={{
          columns: ['beta', 'infected.final'],
          rows: Array.from({ length: 80 }, (_, index) => ({
            beta: index,
            'infected.final': index / 100,
          })),
        }}
      />,
    )

    expect(screen.getAllByTestId('results-x-tick')).toHaveLength(7)
  })
})
