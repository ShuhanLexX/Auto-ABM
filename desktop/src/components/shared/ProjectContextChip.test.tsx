import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { ProjectContextChip } from './ProjectContextChip'

describe('ProjectContextChip', () => {
  it('shows only the source project label and worktree marker for isolated worktrees', () => {
    render(
      <ProjectContextChip
        workDir="/workspace/OpenCutSkill/.claude/worktrees/desktop-main-54a09f85"
        sourceWorkDir="/workspace/OpenCutSkill"
        repoName={null}
        branch="main"
        isWorktree
        worktreeSlug="desktop-main-54a09f85"
      />,
    )

    expect(screen.getByText('OpenCutSkill')).toBeInTheDocument()
    expect(screen.getByText('worktree')).toBeInTheDocument()
    expect(screen.queryByText('main')).not.toBeInTheDocument()
    expect(screen.queryByText('desktop-main-54a09f85')).not.toBeInTheDocument()
    expect(screen.getByText('OpenCutSkill').closest('div')?.getAttribute('title')).not.toContain('/workspace/OpenCutSkill')
  })

  it('does not show worktree details for a normal checkout', () => {
    render(
      <ProjectContextChip
        workDir="/workspace/OpenCutSkill"
        repoName={null}
        branch="main"
      />,
    )

    expect(screen.getByText('OpenCutSkill')).toBeInTheDocument()
    expect(screen.queryByText('worktree')).not.toBeInTheDocument()
  })

  it('shows only the folder name for Windows paths', () => {
    render(
      <ProjectContextChip
        workDir="E:\\Projects\\AutoABM"
        repoName={null}
        branch={null}
      />,
    )

    expect(screen.getByText('AutoABM')).toBeInTheDocument()
    expect(screen.queryByText('E:\\Projects\\AutoABM')).not.toBeInTheDocument()
  })
})
