import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MiniExplainPopover } from './MiniExplainPopover'
import { useSettingsStore } from '../../stores/settingsStore'

const { askMiniExplainMock } = vi.hoisted(() => ({
  askMiniExplainMock: vi.fn(async (body: { question?: string }): Promise<{
    text: string
    source: 'model' | 'fallback'
    error?: string
  }> => ({
    text: body.question ? `模型追问回答：${body.question}` : '模型解释接口回答：tick 0-3 指标有真实变化。',
    source: 'model' as const,
  })),
}))

vi.mock('../trace/traceClient', () => ({
  traceClient: {
    fetchExplainContext: vi.fn(),
    askMiniExplain: askMiniExplainMock,
  },
}))

beforeEach(() => {
  useSettingsStore.setState({ locale: 'en' })
})

afterEach(() => {
  cleanup()
  askMiniExplainMock.mockClear()
})

describe('MiniExplainPopover', () => {
  it('opens as a small AI conversation and supports follow-up questions', async () => {
    render(
      <MiniExplainPopover
        open
        anchor={{ x: 100, y: 100 }}
        target={{ title: 'AI 局部对话', subject: '智能体 #7' }}
        onClose={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/模型解释接口回答/)).toBeInTheDocument()
    })
    expect(screen.getByText('Model response')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Ask about this object...'), {
      target: { value: '为什么状态会变化？' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send follow-up' }))

    expect(screen.getByText('为什么状态会变化？')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/模型追问回答：为什么状态会变化/)).toBeInTheDocument()
    })
    expect(askMiniExplainMock).toHaveBeenCalledTimes(2)
  })

  it('marks fallback answers so they are not confused with model output', async () => {
    askMiniExplainMock.mockResolvedValueOnce({
      text: 'No Trace evidence was found.',
      source: 'fallback' as const,
    })

    render(
      <MiniExplainPopover
        open
        anchor={{ x: 100, y: 100 }}
        target={{ title: 'Local AI explanation', subject: 'interval' }}
        onClose={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Local evidence fallback')).toBeInTheDocument()
    })
    expect(screen.getByText(/uses local object and Trace evidence only/)).toBeInTheDocument()
  })
})
